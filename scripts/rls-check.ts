/**
 * Live role check against a running Supabase stack, using REAL tokens from Supabase Auth
 * (the SQL suite in supabase/tests/rls_check.sql fakes the claims; this proves the shape GoTrue issues).
 *
 *   npm run check:rls            → the local stack from `npx supabase start`
 *   npm run check:rls -- --remote → no longer supported: the admin check needs a Google identity row
 *                                   that only the local database lets us create (migration 23)
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
  // is_admin() (migration 23) reads the Google identity row, which the admin API cannot create, so the
  // local stack gets one straight from the database. A remote project has no such door.
  if (remote) {
    throw new Error("check:rls --remote cannot create a Google identity; run it against the local stack instead.");
  }
  const identity = JSON.stringify({ sub: u.user.id, email, email_verified: true });
  execSync(`docker exec -i supabase_db_trip-planner psql -U postgres -v ON_ERROR_STOP=1`, {
    input:
      `insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at) ` +
      `values (gen_random_uuid(), '${u.user.id}', '${identity}'::jsonb, 'google', '${u.user.id}', now(), now());`,
  });
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
  let secondId: string | null = null; // a second trip made by the multi-trip checks (migration 34)
  try {
    check("owner is admin", (await owner.rpc("is_admin")).data === true);
    check("anonymous viewer is not admin", (await viewer.rpc("is_admin")).data === false);

    const { data: created_trip, error: ce } = await owner.rpc("create_trip", { p_name: "rls-check trip" });
    check("owner can create a trip", !ce && !!created_trip);
    tripId = created_trip ?? null;
    check("anonymous user cannot create a trip", !!(await viewer.rpc("create_trip", { p_name: "x" })).error);
    if (!tripId) throw new Error("no trip to test against");

    await owner.from("travelers").insert({ trip_id: tripId, name: "Aq" });
    // The invite link is owner-only (migration 25): the table refuses the column, active_trip() hands it to the owner.
    check("owner cannot read join_token from the table", !!(await owner.from("trips").select("join_token").eq("id", tripId)).error);
    const { data: trip } = await owner.rpc("active_trip");
    const token = trip?.[0]?.join_token ?? "";
    check("owner gets the invite link from active_trip", token.length > 8);

    check("stranger sees no trips", ((await stranger.from("trips").select("id")).data ?? []).length === 0);
    check("stranger sees no travelers", ((await stranger.from("travelers").select("id")).data ?? []).length === 0);

    const j = await viewer.rpc("join_trip", { p_token: token });
    check("viewer can join with the link", !j.error);
    await viewer.rpc("join_trip", { p_token: token }); // opening the link again
    check("a member can refresh their own membership copy", !(await viewer.rpc("sync_my_membership")).error);
    check(
      "joining added exactly one linked traveler",
      (((await (admin as unknown as SupabaseClient).from("travelers").select("id").eq("trip_id", tripId).not("user_id", "is", null)).data as unknown[]) ?? []).length === 1,
    );
    check(
      "viewer reads the trip",
      ((await viewer.from("trips").select("id").eq("id", tripId)).data ?? []).length === 1,
    );
    check("viewer cannot read join_token from the table", !!(await viewer.from("trips").select("join_token").eq("id", tripId)).error);
    check("viewer's active_trip has no invite link", (await viewer.rpc("active_trip")).data?.[0]?.join_token === "");
    check("viewer's bootstrap has no invite link", ((await viewer.rpc("trip_bootstrap")).data as { trip?: { join_token?: string } } | null)?.trip?.join_token === "");
    check(
      // The owner's traveler plus the one migration 20 adds for the viewer who joined by link.
      "viewer reads travelers",
      ((await viewer.from("travelers").select("id").eq("trip_id", tripId)).data ?? []).length === 2,
    );
    check("viewer is a viewer", (await viewer.rpc("trip_role", { t: tripId })).data === "viewer");
    check("viewer cannot insert", !!(await viewer.from("travelers").insert({ trip_id: tripId, name: "nope" })).error);
    const upd = await viewer.from("travelers").update({ name: "hacked" }).eq("trip_id", tripId).select();
    check("viewer cannot update", (upd.data ?? []).length === 0);
    const del = await viewer.from("travelers").delete().eq("trip_id", tripId).select();
    check("viewer cannot delete", (del.data ?? []).length === 0);
    // Migration 32: payment handles. The owner may set them, a stranger and a viewer may not, and a huge value is refused.
    const payOwn = await owner.from("travelers").update({ payment: { gcash: "0917 123 4567" } }).eq("trip_id", tripId).eq("name", "Aq").select();
    check("owner can set a payment handle", (payOwn.data ?? []).length === 1);
    const payViewer = await viewer.from("travelers").update({ payment: { gcash: "0000 000 0000" } }).eq("trip_id", tripId).select();
    check("viewer cannot change a payment handle", (payViewer.data ?? []).length === 0);
    const payStranger = await stranger.from("travelers").update({ payment: { gcash: "0000 000 0000" } }).eq("trip_id", tripId).select();
    check("stranger cannot change a payment handle", (payStranger.data ?? []).length === 0);
    check("a payment value over 400 characters is refused", !!(await owner.from("travelers").update({ payment: { other: "x".repeat(500) } }).eq("trip_id", tripId)).error);
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
    // Itinerary order and connectors (migration 16): the owner writes them, a viewer reads but never writes.
    const conn = await owner
      .from("itinerary_items")
      .insert({ trip_id: tripId, activity: "Walk", kind: "commute", day: 1, position: 1500, duration_min: 12, details: { mode: "walk" } })
      .select("id")
      .single();
    check("owner can add a commute", !!conn.data);
    const connId = conn.data!.id;
    const seenConn = await viewer.from("itinerary_items").select("kind, position").eq("id", connId).single();
    check("a viewer can read a connector", seenConn.data?.kind === "commute" && seenConn.data?.position === 1500);
    check(
      "viewer cannot move an item or change its kind",
      ((await viewer.from("itinerary_items").update({ position: 1, kind: "stop" }).eq("id", connId).select()).data ?? []).length === 0,
    );
    check("kind must be stop, commute or buffer", !!(await owner.from("itinerary_items").update({ kind: "nonsense" }).eq("id", connId)).error);
    check(
      "connector details must be a JSON object",
      !!(await owner.from("itinerary_items").update({ details: [1] as never }).eq("id", connId)).error,
    );
    await owner.from("itinerary_items").delete().eq("id", connId);

    // Category details and the deal-breaker flag (migration 15): the owner writes them, a viewer reads but never writes.
    check(
      "owner can save details and the deal-breaker flag",
      ((await owner.from("attractions").update({ details: { type: "nature", entranceFee: 0 }, deal_breaker: true }).eq("id", ideaId).select("id")).data ?? [])
        .length === 1,
    );
    const seen = await viewer.from("attractions").select("details, deal_breaker").eq("id", ideaId).single();
    check("a viewer can read details", (seen.data?.details as { type?: string } | null)?.type === "nature" && seen.data?.deal_breaker === true);
    check(
      "viewer cannot change details or the deal-breaker flag",
      ((await viewer.from("attractions").update({ details: { type: "other" }, deal_breaker: false }).eq("id", ideaId).select()).data ?? [])
        .length === 0,
    );
    check(
      "details must be a JSON object",
      !!(await owner.from("attractions").update({ details: [1] as never }).eq("id", ideaId)).error,
    );
    // A stay is a hotel idea that has been booked (migration 31).
    const stayRow = await owner.from("hotel_ideas").insert({ trip_id: tripId, hotel: "rls-check stay", decision: "confirmed", is_stay: true, check_in: "2026-06-16", check_out: "2026-06-18", stay_status: "Booked", confirmation: "RLS-1", details: { cancellation: "free" } }).select("id").single();
    check("owner can book a stay", !stayRow.error && !!stayRow.data);
    // The app reads every column with select("*"): the new booking columns must come back, for a viewer too.
    for (const [who, client] of [["owner", owner], ["viewer", viewer]] as const) {
      const full = await client.from("hotel_ideas").select("*").eq("id", stayRow.data!.id).single();
      check(`${who} reads a booked stay with its booking columns`, full.data?.is_stay === true && full.data?.stay_status === "Booked" && full.data?.check_in === "2026-06-16" && full.data?.confirmation === "RLS-1");
    }
    check(
      "viewer cannot change a stay's details",
      ((await viewer.from("hotel_ideas").update({ details: { cancellation: "none" } }).eq("id", stayRow.data!.id).select()).data ?? []).length === 0,
    );
    check(
      "viewer cannot change a stay's booking",
      ((await viewer.from("hotel_ideas").update({ stay_status: "Cancelled", confirmation: "X" }).eq("id", stayRow.data!.id).select()).data ?? []).length === 0,
    );
    check("the old stays table is gone from the API", !!(await (owner as unknown as SupabaseClient).from("stays").select("id").limit(1)).error);
    await owner.from("hotel_ideas").delete().eq("id", stayRow.data!.id);

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
    // Activity photos (migration 17): the same table, item_table = itinerary_items. Added and removed here so the counts below hold.
    const actPic = { trip_id: tripId, item_table: "itinerary_items", item_id: randomUUID(), source: "link", url: "https://cdn.example.com/act.jpg" };
    const actAdd = await owner.from("item_images").insert(actPic).select("id").single();
    check("owner can add a photo to an itinerary activity (migration 17)", !actAdd.error);
    check("viewer cannot add a photo to an activity", !!(await viewer.from("item_images").insert({ ...actPic, item_id: randomUUID() })).error);
    check("a photo cannot name an unknown table", !!(await owner.from("item_images").insert({ ...actPic, item_table: "expenses" })).error);
    if (actAdd.data) await owner.from("item_images").delete().eq("id", actAdd.data.id);
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
    // Expense splits (migration 19): the owner can set one; a viewer cannot; it has to be a small object.
    if (logged.data) {
      const split = { mode: "percent", shares: { a: 60, b: 40 }, servicePct: 10, serviceSplit: "equal" };
      check("owner can set how an expense is split (migration 19)", !(await owner.from("expenses").update({ split }).eq("id", logged.data.id)).error);
      check("a split must be an object", !!(await owner.from("expenses").update({ split: [1, 2] }).eq("id", logged.data.id)).error);
      check(
        "viewer cannot change a split",
        ((await viewer.from("expenses").update({ split: null }).eq("id", logged.data.id).select()).data ?? []).length === 0,
      );
    }
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
    // Time zones (migration 18)
    check(
      "owner can set a flight's time zones",
      !(await owner.from("flights").update({ dep_tz: "Asia/Manila", arr_tz: "Asia/Tokyo" }).eq("id", flightId)).error,
    );
    check(
      "a flight time zone longer than 64 characters is refused",
      !!(await owner.from("flights").update({ dep_tz: "x".repeat(65) }).eq("id", flightId)).error,
    );
    check(
      "viewer cannot change a flight's time zone",
      ((await viewer.from("flights").update({ arr_tz: "UTC" }).eq("id", flightId).select()).data ?? []).length === 0,
    );
    check(
      "owner can set the trip's home time zone, a viewer cannot",
      !(await owner.from("trips").update({ timezone: "Asia/Tokyo" }).eq("id", tripId)).error &&
        ((await viewer.from("trips").update({ timezone: "UTC" }).eq("id", tripId).select()).data ?? []).length === 0,
    );
    await owner.from("trips").update({ timezone: "Asia/Manila" }).eq("id", tripId);
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

    // Migration 34: several live trips per person, with real GoTrue sessions.
    const second = await owner.rpc("new_trip", { p_name: "Live second trip" });
    check("owner can add a second trip", !second.error && !!second.data);
    if (second.data) {
      secondId = second.data;
      const mine = (await owner.rpc("my_trips")).data ?? [];
      check("owner's my_trips lists both live trips", [tripId, secondId].every((id) => mine.some((t) => t.id === id && t.archived_at === null)));
      const boot = (await stranger.rpc("trip_bootstrap", { p_trip: secondId })).data as { trip?: unknown; role?: unknown } | null;
      check("a person not on the second trip gets no trip or role from trip_bootstrap(id)", !boot?.trip && !boot?.role);
      check("a person not on the second trip cannot archive it", !!(await stranger.rpc("archive_trip", { p_trip: secondId })).error);
      check("a person not on the second trip does not see it in my_trips", !((await stranger.rpc("my_trips")).data ?? []).some((t) => t.id === secondId));
      check("the first trip is still there for the owner after adding another", mine.some((t) => t.id === tripId));
      check("owner can archive the second trip", !(await owner.rpc("archive_trip", { p_trip: secondId })).error);
      check(
        "archiving the second trip leaves the first live",
        ((await owner.rpc("my_trips")).data ?? []).some((t) => t.id === tripId && t.archived_at === null),
      );
    }
  } finally {
    if (secondId) await admin.from("trips").delete().eq("id", secondId);
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
