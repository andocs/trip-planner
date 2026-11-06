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
  const password = `pw-${stamp}-Aa1!`;
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
