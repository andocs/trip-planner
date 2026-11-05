/**
 * End-to-end RLS check against a real Supabase project, using two anonymous users.
 * Run: npm run check:rls   (reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local)
 * Requires Authentication → Anonymous sign-ins to be enabled. Leaves one small test trip behind.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

type Client = SupabaseClient<Database>;
const CHILD_TABLES = [
  "travelers",
  "destinations",
  "categories",
  "expenses",
  "itinerary_items",
  "flights",
  "transfers",
  "stays",
  "hotel_ideas",
  "food_places",
  "menu_items",
  "attractions",
  "packing_items",
  "gifts",
  "reminders",
] as const;

const failures: string[] = [];
let checks = 0;
function check(ok: boolean, message: string) {
  checks++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${message}`);
  if (!ok) failures.push(message);
}

function newClient(): Client {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(client: Client, label: string) {
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`${label} anonymous sign-in failed: ${error.message}`);
}

async function main() {
  const a = newClient();
  const b = newClient();
  const nobody = newClient();
  await signIn(a, "A");
  await signIn(b, "B");

  console.log("User A creates a trip");
  const { data: tripId, error: createErr } = await a.rpc("create_trip", { p_name: "RLS check" });
  if (createErr || !tripId) throw new Error(`create_trip failed: ${createErr?.message}`);
  const { data: trip } = await a.from("trips").select("join_token").eq("id", tripId).single();
  const token = trip?.join_token;
  check(!!token, "A can read its own trip and token");
  await a.from("reminders").insert({ trip_id: tripId, text: "secret" });
  const { count: catCount } = await a
    .from("categories")
    .select("*", { count: "exact", head: true })
    .eq("trip_id", tripId);
  check(catCount === 8, `A sees 8 default categories (saw ${catCount})`);
  const { error: directInsert } = await a.from("trips").insert({ name: "direct" });
  check(!!directInsert, "A cannot insert into trips directly");

  console.log("User B (no link) tries to get in");
  const { data: bTrips } = await b.from("trips").select("id").eq("id", tripId);
  check((bTrips ?? []).length === 0, "B cannot read A's trip");
  const { data: bActive } = await b.rpc("active_trip");
  check((bActive ?? []).length === 0, "B has no active trip");
  for (const table of CHILD_TABLES) {
    const { data } = await b.from(table).select("id").eq("trip_id", tripId);
    check((data ?? []).length === 0, `B cannot read ${table}`);
  }
  const { error: bInsert } = await b.from("travelers").insert({ trip_id: tripId, name: "intruder" });
  check(!!bInsert, "B cannot insert into A's travelers");
  const { data: bUpdated } = await b.from("trips").update({ name: "hacked" }).eq("id", tripId).select("id");
  check((bUpdated ?? []).length === 0, "B cannot update A's trip");
  const { data: bDeleted } = await b.from("reminders").delete().eq("trip_id", tripId).select("id");
  check((bDeleted ?? []).length === 0, "B cannot delete A's reminders");
  const { error: bRegen } = await b.rpc("regenerate_join_token", { p_trip: tripId });
  check(!!bRegen, "B cannot regenerate A's invite link");
  const { error: badJoin } = await b.rpc("join_trip", { p_token: "not-the-token" });
  check(!!badJoin, "B cannot join with a wrong token");

  console.log("No session at all");
  const { data: anonTrips } = await nobody.from("trips").select("id");
  check((anonTrips ?? []).length === 0, "Signed-out client reads no trips");
  const { error: anonJoin } = await nobody.rpc("join_trip", { p_token: token! });
  check(!!anonJoin, "Signed-out client cannot call join_trip");

  console.log("User B opens the invite link");
  const { data: joined, error: joinErr } = await b.rpc("join_trip", { p_token: token! });
  check(!joinErr && joined === tripId, "join_trip with the right token works");
  const { error: rejoinErr } = await b.rpc("join_trip", { p_token: token! });
  check(!rejoinErr, "join_trip is idempotent");
  const { data: bReminders } = await b.from("reminders").select("text").eq("trip_id", tripId);
  check((bReminders ?? []).length === 1, "B can read the trip's data after joining");

  console.log(
    failures.length ? `\nRLS CHECK FAILED (${failures.length}/${checks})` : `\nRLS CHECK PASSED (${checks} checks)`,
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
