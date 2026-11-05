/**
 * Load the Vietnam '26 example from the command line.
 *
 *   npm run seed                      → signs in anonymously, creates a NEW trip with the example,
 *                                       and prints its invite link (open it to see the trip).
 *   npm run seed -- --token <token>   → loads into the existing trip with that invite token
 *                                       (needs SUPABASE_SERVICE_ROLE_KEY in .env.local; the trip must be empty).
 *
 * Options: --file <path> (default seed/vietnam26.seed.json), --app <url> (for the printed link).
 * The service-role key bypasses RLS: it is only read here, never shipped to the browser.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { applySeedPlan, planForTrip, tripIsEmpty } from "../lib/seed-apply";
import { loadEnv } from "./env";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = arg("file") ?? "seed/vietnam26.seed.json";
const token = arg("token");
const appUrl = (arg("app") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function main() {
  if (!url || !anonKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  const seed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };

  let client: SupabaseClient<Database>;
  let tripId: string;
  let joinToken: string;

  if (token) {
    if (!serviceKey) throw new Error("--token needs SUPABASE_SERVICE_ROLE_KEY in .env.local");
    client = createClient<Database>(url, serviceKey, opts);
    const { data, error } = await client.from("trips").select("id, join_token").eq("join_token", token).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("No trip has that invite token.");
    tripId = data.id;
    joinToken = data.join_token;
  } else {
    client = createClient<Database>(url, anonKey, opts);
    const { error: authErr } = await client.auth.signInAnonymously();
    if (authErr) throw new Error(`Anonymous sign-in failed (is it enabled in Supabase?): ${authErr.message}`);
    const { data: id, error } = await client.rpc("create_trip", { p_name: "Vietnam '26" });
    if (error) throw error;
    tripId = id;
    const { data: trip, error: tErr } = await client.from("trips").select("join_token").eq("id", id).single();
    if (tErr) throw tErr;
    joinToken = trip.join_token;
  }

  if (!(await tripIsEmpty(client, tripId)))
    throw new Error("That trip already has data; the example only loads into an empty trip.");
  const plan = await planForTrip(client, tripId, seed);
  await applySeedPlan(client, tripId, plan);

  const counts = Object.entries(plan.rows)
    .filter(([, rows]) => rows.length)
    .map(([t, rows]) => `${t} ${rows.length}`)
    .join(", ");
  console.log(`Loaded "${plan.trip.name}": ${counts}`);
  for (const note of plan.notes) console.log(`  note: ${note}`);
  console.log(
    `\nOpen this link to see it (it grants edit access, so share it carefully):\n  ${appUrl}/join/${joinToken}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
