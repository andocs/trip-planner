/**
 * Live role check against a running Supabase stack, using REAL tokens from Supabase Auth
 * (the SQL suite in supabase/tests/rls_check.sql fakes the claims; this proves the shape GoTrue issues).
 *
 *   npm run check:rls            → the local stack from `npx supabase start`
 *   npm run check:rls -- --remote → NEXT_PUBLIC_SUPABASE_URL from .env.local (uses the service-role key to
 *                                   create and delete throwaway users and one throwaway trip)
 *
 * Creates: a Google-style admin (owner), two anonymous users (viewer, stranger). Deletes everything after.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../lib/database.types";
import { loadEnv } from "./env";

const remote = process.argv.includes("--remote");
let url: string, anonKey: string, serviceKey: string;
if (remote) {
  loadEnv();
  url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
} else {
  const out = execSync("npx supabase status -o env", { encoding: "utf8" });
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?$`, "m").exec(out)?.[1] ?? "";
  url = get("API_URL");
  anonKey = get("ANON_KEY");
  serviceKey = get("SERVICE_ROLE_KEY");
}
if (!url || !anonKey || !serviceKey) {
  console.error("Missing URL / anon key / service-role key. Is `npx supabase start` running?");
  process.exit(1);
}

type Client = SupabaseClient<Database>;
const mk = (key: string): Client =>
  createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const failures: string[] = [];
let checks = 0;
const check = (name: string, ok: boolean) => {
  checks++;
  if (!ok) failures.push(name);
};

async function main() {
  const admin = mk(serviceKey);
  const stamp = Date.now();
  const email = `owner-${stamp}@rls-check.test`;
  // Random per run, never stored: this throwaway user is deleted at the end of the check.
  const password = randomBytes(24).toString("base64url");
  const created: string[] = [];

  // Owner: a non-anonymous account whose app_metadata says google, the way an OAuth sign-in does.
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { provider: "google", providers: ["google"] },
  });
  if (ue || !u.user) throw ue ?? new Error("could not create the owner");
  created.push(u.user.id);
  await (admin as unknown as SupabaseClient).from("app_admins").insert({ email });

  const owner = mk(anonKey);
  const { error: se } = await owner.auth.signInWithPassword({ email, password });
  if (se) throw se;

  const viewer = mk(anonKey);
  const stranger = mk(anonKey);
  const v = await viewer.auth.signInAnonymously();
  const s = await stranger.auth.signInAnonymously();
  if (v.data.user) created.push(v.data.user.id);
  if (s.data.user) created.push(s.data.user.id);
  if (v.error || s.error) throw v.error ?? s.error;

  let tripId: string | null = null;
  try {
    check("owner is admin", (await owner.rpc("is_admin")).data === true);
    check("anonymous viewer is not admin", (await viewer.rpc("is_admin")).data === false);

    const { data: created_trip, error: ce } = await owner.rpc("create_trip", { p_name: "rls-check trip" });
    check("owner can create a trip", !ce && !!created_trip);
    tripId = created_trip ?? null;
    check("anonymous user cannot create a trip", !!(await viewer.rpc("create_trip", { p_name: "x" })).error);
    if (!tripId) throw new Error("no trip to test against");

    await owner.from("travelers").insert({ trip_id: tripId, name: "Aq" });
    const { data: trip } = await owner.from("trips").select("join_token").eq("id", tripId).single();
    const token = trip!.join_token;

    check("stranger sees no trips", ((await stranger.from("trips").select("id")).data ?? []).length === 0);
    check("stranger sees no travelers", ((await stranger.from("travelers").select("id")).data ?? []).length === 0);

    const j = await viewer.rpc("join_trip", { p_token: token });
    check("viewer can join with the link", !j.error);
    check(
      "viewer reads the trip",
      ((await viewer.from("trips").select("id").eq("id", tripId)).data ?? []).length === 1,
    );
    check(
      "viewer reads travelers",
      ((await viewer.from("travelers").select("id").eq("trip_id", tripId)).data ?? []).length === 1,
    );
    check("viewer is a viewer", (await viewer.rpc("trip_role", { t: tripId })).data === "viewer");
    check("viewer cannot insert", !!(await viewer.from("travelers").insert({ trip_id: tripId, name: "nope" })).error);
    const upd = await viewer.from("travelers").update({ name: "hacked" }).eq("trip_id", tripId).select();
    check("viewer cannot update", (upd.data ?? []).length === 0);
    const del = await viewer.from("travelers").delete().eq("trip_id", tripId).select();
    check("viewer cannot delete", (del.data ?? []).length === 0);
    check("viewer cannot replace the link", !!(await viewer.rpc("regenerate_invite", { p_trip: tripId })).error);
    check(
      "owner still has the traveler",
      ((await owner.from("travelers").select("name").eq("trip_id", tripId)).data ?? [])[0]?.name === "Aq",
    );

    // Drafts, votes and comments (migration 9). Viewers take part, but never edit the plan.
    const viewerId = v.data.user!.id;
    const ownerId = u.user.id;
    const { data: idea } = await owner
      .from("attractions")
      .insert({ trip_id: tripId, name: "rls-check idea" })
      .select("id, decision")
      .single();
    check("new ideas start as drafts", idea?.decision === "draft");
    const ideaId = idea!.id;
    const asVote = { trip_id: tripId, item_table: "attractions", item_id: ideaId };
    check("viewer can vote", !(await viewer.from("votes").insert({ ...asVote, value: "in" })).error);
    check(
      "viewer cannot vote as someone else",
      !!(await viewer.from("votes").insert({ ...asVote, user_id: ownerId, value: "pass" })).error,
    );
    check(
      "viewer cannot vote twice on one idea",
      !!(await viewer.from("votes").insert({ ...asVote, value: "maybe" })).error,
    );
    check("stranger cannot vote", !!(await stranger.from("votes").insert({ ...asVote, value: "in" })).error);
    check("stranger reads no votes", ((await stranger.from("votes").select("id")).data ?? []).length === 0);
    check(
      "a vote value outside in/maybe/pass is refused",
      !!(await owner.from("votes").insert({ ...asVote, value: "love" })).error,
    );
    check(
      "viewer can change their own vote",
      ((await viewer.from("votes").update({ value: "maybe" }).eq("user_id", viewerId).select()).data ?? []).length ===
        1,
    );
    check(
      "viewer cannot move a vote to someone else",
      !!(await viewer.from("votes").update({ user_id: ownerId }).eq("user_id", viewerId)).error,
    );
    check(
      "owner cannot change a viewer's vote",
      ((await owner.from("votes").update({ value: "pass" }).eq("user_id", viewerId).select()).data ?? []).length === 0,
    );

    check("viewer can comment", !(await viewer.from("comments").insert({ ...asVote, body: "from the viewer" })).error);
    check(
      "viewer cannot comment as someone else",
      !!(await viewer.from("comments").insert({ ...asVote, user_id: ownerId, body: "forged" })).error,
    );
    check("stranger cannot comment", !!(await stranger.from("comments").insert({ ...asVote, body: "hi" })).error);
    await owner.from("comments").insert({ ...asVote, body: "from the owner" });
    const mine = await viewer.from("comments").select("id, user_id").eq("item_id", ideaId);
    check("viewer reads every comment on the idea", (mine.data ?? []).length === 2);
    const ownerComment = (mine.data ?? []).find((c) => c.user_id === ownerId);
    check(
      "viewer cannot delete the owner's comment",
      ((await viewer.from("comments").delete().eq("id", ownerComment!.id).select()).data ?? []).length === 0,
    );
    check(
      "viewer cannot edit the owner's comment",
      ((await viewer.from("comments").update({ body: "hacked" }).eq("id", ownerComment!.id).select()).data ?? [])
        .length === 0,
    );
    const viewerComment = (mine.data ?? []).find((c) => c.user_id === viewerId);
    check(
      "owner can delete a viewer's comment",
      ((await owner.from("comments").delete().eq("id", viewerComment!.id).select()).data ?? []).length === 1,
    );

    check(
      "viewer cannot change a decision",
      ((await viewer.from("attractions").update({ decision: "confirmed" }).eq("id", ideaId).select()).data ?? [])
        .length === 0,
    );
    check(
      "viewer cannot add an idea",
      !!(await viewer.from("attractions").insert({ trip_id: tripId, name: "nope" })).error,
    );
    check(
      "viewer cannot add a tentative stop",
      !!(
        await viewer
          .from("itinerary_items")
          .insert({ trip_id: tripId, activity: "x", source_table: "attractions", source_id: ideaId })
      ).error,
    );

    const stop = await owner
      .from("itinerary_items")
      .insert({ trip_id: tripId, activity: "rls-check idea", source_table: "attractions", source_id: ideaId })
      .select("id, tentative")
      .single();
    check("a stop from a draft is tentative", stop.data?.tentative === true);
    await owner.from("attractions").update({ decision: "confirmed" }).eq("id", ideaId);
    const solid = await owner.from("itinerary_items").select("tentative").eq("id", stop.data!.id).single();
    check("confirming makes the stop solid", solid.data?.tentative === false);
    await owner.from("attractions").update({ decision: "dropped" }).eq("id", ideaId);
    check(
      "dropping removes the stop",
      ((await owner.from("itinerary_items").select("id").eq("id", stop.data!.id)).data ?? []).length === 0,
    );

    check(
      "viewer can set their own display name",
      !(await viewer.rpc("set_my_label", { p_trip: tripId, p_label: "Tita Rose" })).error,
    );
    const people = await viewer.rpc("trip_people", { p_trip: tripId });
    check(
      "trip_people shows names without emails",
      (people.data ?? []).some((x) => x.label === "Tita Rose") && !JSON.stringify(people.data).includes("@"),
    );
    check(
      "a stranger cannot list the people",
      ((await stranger.rpc("trip_people", { p_trip: tripId })).data ?? []).length === 0,
    );
    check(
      "a stranger cannot set a name on this trip",
      !!(await stranger.rpc("set_my_label", { p_trip: tripId, p_label: "Intruder" })).error,
    );

    // Google places (migration 10): a link per idea, and the monthly-cap guard that only the owner can use.
    const asRef = { trip_id: tripId, item_table: "attractions", item_id: ideaId, place_id: "ChIJ-rls-check-1" };
    check("owner can link an idea to a place", !(await owner.from("place_refs").insert(asRef)).error);
    check(
      "viewer reads the place link",
      ((await viewer.from("place_refs").select("id").eq("trip_id", tripId)).data ?? []).length === 1,
    );
    check("stranger reads no place links", ((await stranger.from("place_refs").select("id")).data ?? []).length === 0);
    check(
      "viewer cannot link a place",
      !!(await viewer.from("place_refs").insert({ ...asRef, item_id: idea!.id, place_id: "ChIJ-rls-check-2" })).error,
    );
    check(
      "viewer cannot change a place link",
      (
        (await viewer.from("place_refs").update({ place_id: "ChIJ-rls-check-3" }).eq("trip_id", tripId).select())
          .data ?? []
      ).length === 0,
    );
    check(
      "viewer cannot delete a place link",
      ((await viewer.from("place_refs").delete().eq("trip_id", tripId).select()).data ?? []).length === 0,
    );
    check(
      "a place link cannot be moved to another trip",
      !!(await owner.from("place_refs").update({ trip_id: ownerId }).eq("trip_id", tripId)).error,
    );
    check("viewer cannot reserve a Google call", !!(await viewer.rpc("reserve_api_call", { p_sku: "photos" })).error);
    check(
      "viewer cannot reserve a description search",
      !!(await viewer.rpc("reserve_api_call", { p_sku: "text_search_atmosphere" })).error,
    );
    check(
      "stranger cannot reserve a Google call",
      !!(await stranger.rpc("reserve_api_call", { p_sku: "photos" })).error,
    );
    check("viewer reads no usage meter", ((await viewer.from("api_usage").select("sku")).data ?? []).length === 0);
    check(
      "owner cannot write the usage meter",
      !!(await owner.from("api_usage").insert({ period: "2026-01-01", sku: "photos", calls: 0 })).error,
    );
    check("owner can run the 30-day coordinate purge", !(await owner.rpc("purge_stale_place_coords")).error);
    if (!remote) {
      // Reserving spends a real unit of the monthly cap, so it is only exercised on the throwaway local stack.
      const r = await owner.rpc("reserve_api_call", { p_sku: "photos" });
      check("owner can reserve a Google call", r.data === "ok");
      check("an unknown sku fails closed", (await owner.rpc("reserve_api_call", { p_sku: "nope" })).data === "cap");
      check(
        "owner can reserve a description search (migration 14)",
        (await owner.rpc("reserve_api_call", { p_sku: "text_search_atmosphere" })).data === "ok",
      );
    }

    // Pictures (migration 11): photos on an idea, and the private Storage bucket with real signed links.
    const pic = { trip_id: tripId, item_table: "attractions", item_id: ideaId };
    const filePath = `${tripId}/${randomUUID()}.jpg`;
    check(
      "owner can add a photo by link",
      !(
        await owner
          .from("item_images")
          .insert({ ...pic, source: "link", url: "https://cdn.example.com/a.jpg", position: 1 })
      ).error,
    );
    check(
      "owner can add a Wikimedia photo",
      !(
        await owner.from("item_images").insert({
          ...pic,
          source: "wikimedia",
          url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg",
          page_url: "https://commons.wikimedia.org/wiki/File:x.jpg",
          credit: "A. Author",
          license: "CC BY-SA 4.0",
          position: 2,
        })
      ).error,
    );
    check(
      "a plain http picture link is refused",
      !!(await owner.from("item_images").insert({ ...pic, source: "link", url: "http://cdn.example.com/a.jpg" })).error,
    );
    check(
      "a photo from another host cannot claim to be Wikimedia",
      !!(
        await owner.from("item_images").insert({
          ...pic,
          source: "wikimedia",
          url: "https://evil.example/x.jpg",
          page_url: "https://commons.wikimedia.org/wiki/File:x.jpg",
        })
      ).error,
    );
    check(
      "an upload cannot point into another trip's folder",
      !!(
        await owner
          .from("item_images")
          .insert({ ...pic, source: "upload", storage_path: `${randomUUID()}/${randomUUID()}.jpg` })
      ).error,
    );
    check(
      "viewer reads the photos",
      ((await viewer.from("item_images").select("id").eq("trip_id", tripId)).data ?? []).length === 2,
    );
    check("stranger reads no photos", ((await stranger.from("item_images").select("id")).data ?? []).length === 0);
    check(
      "viewer cannot add a photo",
      !!(await viewer.from("item_images").insert({ ...pic, source: "link", url: "https://cdn.example.com/v.jpg" }))
        .error,
    );
    check(
      "viewer cannot reorder or remove photos",
      ((await viewer.from("item_images").update({ position: 9 }).eq("trip_id", tripId).select()).data ?? []).length ===
        0 && ((await viewer.from("item_images").delete().eq("trip_id", tripId).select()).data ?? []).length === 0,
    );
    check(
      "a photo's address cannot be changed afterwards",
      !!(await owner.from("item_images").update({ url: "https://evil.example/x.jpg" }).eq("trip_id", tripId)).error,
    );
    const status = await owner.rpc("photo_storage_status");
    check("owner can read the storage meter", !status.error && Number(status.data?.[0]?.cap) === 900 * 1024 * 1024);
    check("viewer cannot read the storage meter", !!(await viewer.rpc("photo_storage_status")).error);
    // Real Storage: a tiny JPEG in this trip's folder.
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    );
    const up = await owner.storage.from("trip-photos").upload(filePath, jpeg, { contentType: "image/jpeg" });
    check("owner can upload into the trip folder", !up.error);
    check(
      "owner cannot upload into another trip's folder",
      !!(
        await owner.storage
          .from("trip-photos")
          .upload(`${randomUUID()}/${randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" })
      ).error,
    );
    check(
      "a non-image type is refused by the bucket",
      !!(
        await owner.storage
          .from("trip-photos")
          .upload(`${tripId}/${randomUUID()}.jpg`, Buffer.from("<html>"), { contentType: "text/html" })
      ).error,
    );
    check(
      "viewer can get a signed link to the photo",
      !!(await viewer.storage.from("trip-photos").createSignedUrl(filePath, 60)).data?.signedUrl,
    );
    check(
      "stranger cannot get a signed link",
      !(await stranger.storage.from("trip-photos").createSignedUrl(filePath, 60)).data?.signedUrl,
    );
    check(
      "viewer cannot upload",
      !!(
        await viewer.storage
          .from("trip-photos")
          .upload(`${tripId}/${randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" })
      ).error,
    );
    check(
      "viewer cannot delete the file",
      ((await viewer.storage.from("trip-photos").remove([filePath])).data ?? []).length === 0,
    );
    check(
      "owner can delete the file",
      ((await owner.storage.from("trip-photos").remove([filePath])).data ?? []).length === 1,
    );

    // Logged expenses and booking references (migrations 12 and 13).
    const fl = await owner
      .from("flights")
      .insert({ trip_id: tripId, from_code: "MNL", to_code: "HAN", fare: 9000, status: "Booked" })
      .select("id")
      .single();
    check("owner can add a flight", !fl.error && !!fl.data);
    const flightId = fl.data!.id;
    const exp = (extra: object) => ({
      trip_id: tripId!,
      currency: "PHP",
      spent_on: "2026-06-01",
      description: "fare",
      amount: 9000,
      ...extra,
    });
    const logged = await owner
      .from("expenses")
      .insert(exp({ source_table: "flights", source_id: flightId }))
      .select("id")
      .single();
    check("owner can log a flight as an expense", !logged.error);
    check(
      "the same flight cannot be logged twice",
      !!(await owner.from("expenses").insert(exp({ source_table: "flights", source_id: flightId }))).error,
    );
    check(
      "an expense cannot point at a made-up booking",
      !!(await owner.from("expenses").insert(exp({ source_table: "flights", source_id: randomUUID() }))).error,
    );
    check(
      "an expense link needs both halves",
      !!(await owner.from("expenses").insert(exp({ source_table: "flights" }))).error,
    );
    check(
      "viewer cannot log an expense",
      !!(await viewer.from("expenses").insert(exp({ source_table: "flights", source_id: randomUUID() }))).error,
    );

    check(
      "owner can add a booking reference",
      !(await owner.from("flight_refs").insert({ flight_id: flightId, trip_id: tripId, booking_ref: "QX7K2P" })).error,
    );
    check(
      "owner can read the booking reference",
      ((await owner.from("flight_refs").select("id")).data ?? []).length === 1,
    );
    check(
      "viewer reads no booking references",
      ((await viewer.from("flight_refs").select("id")).data ?? []).length === 0,
    );
    check(
      "stranger reads no booking references",
      ((await stranger.from("flight_refs").select("id")).data ?? []).length === 0,
    );
    check(
      "viewer cannot add a booking reference",
      !!(await viewer.from("flight_refs").insert({ flight_id: flightId, trip_id: tripId, booking_ref: "HACK99" }))
        .error,
    );
    check(
      "viewer cannot change or remove it",
      (
        (await viewer.from("flight_refs").update({ booking_ref: "HACK99" }).eq("flight_id", flightId).select()).data ??
        []
      ).length === 0 &&
        ((await viewer.from("flight_refs").delete().eq("flight_id", flightId).select()).data ?? []).length === 0,
    );
    check(
      "the owner's reference is unchanged",
      (await owner.from("flight_refs").select("booking_ref").eq("flight_id", flightId).single()).data?.booking_ref ===
        "QX7K2P",
    );
    check(
      "viewer can see that a flight has a reference, not what it is",
      (await viewer.from("flights").select("has_ref").eq("id", flightId).single()).data?.has_ref === true,
    );
    await owner.from("flights").delete().eq("id", flightId);
    check(
      "deleting a flight deletes its reference but keeps the logged expense",
      ((await owner.from("flight_refs").select("id")).data ?? []).length === 0 &&
        (await owner.from("expenses").select("source_id").eq("id", logged.data!.id).single()).data?.source_id === null,
    );

    const nt = await owner.rpc("regenerate_invite", { p_trip: tripId });
    check("owner can replace the link", !nt.error && !!nt.data);
    check(
      "viewer loses access after the link is replaced",
      ((await viewer.from("trips").select("id").eq("id", tripId)).data ?? []).length === 0,
    );
    check("old link no longer works", !!(await stranger.rpc("join_trip", { p_token: token })).error);
    check("new link works", !(await stranger.rpc("join_trip", { p_token: nt.data! })).error);
  } finally {
    if (tripId) await admin.from("trips").delete().eq("id", tripId);
    await (admin as unknown as SupabaseClient).from("app_admins").delete().eq("email", email);
    for (const id of created) await admin.auth.admin.deleteUser(id);
  }
}

main()
  .then(() => {
    if (failures.length) {
      console.error(`LIVE RLS CHECK FAILED: ${failures.join("; ")}`);
      process.exit(1);
    }
    console.log(`LIVE RLS CHECK PASSED (${checks} checks)`);
  })
  .catch((e) => {
    console.error("LIVE RLS CHECK ERROR:", e);
    process.exit(1);
  });
