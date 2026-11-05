import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildSeedPlan, INSERT_ORDER, type SeedPlan } from "@/lib/seed-map";

type Client = SupabaseClient<Database>;

/** Tables that must be empty before loading the example (default categories don't count). */
const CONTENT_TABLES = INSERT_ORDER.filter((t) => t !== "categories");

export async function tripIsEmpty(client: Client, tripId: string): Promise<boolean> {
  const db = client as unknown as SupabaseClient;
  const counts = await Promise.all(
    CONTENT_TABLES.map(async (t) => {
      const { count, error } = await db.from(t).select("id", { count: "exact", head: true }).eq("trip_id", tripId);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  return counts.every((c) => c === 0);
}

/** Builds the plan for this trip, matching the trip's existing categories by name. */
export async function planForTrip(client: Client, tripId: string, seed: unknown): Promise<SeedPlan> {
  const { data: cats, error } = await client.from("categories").select("id, name").eq("trip_id", tripId);
  if (error) throw error;
  return buildSeedPlan(seed, cats ?? []);
}

/**
 * Writes a seed plan into a trip. supabase-js can't wrap several requests in one
 * transaction, so on any failure the rows inserted so far are deleted again
 * (in reverse order) and the error is re-thrown: the trip is never left half-loaded.
 */
export async function applySeedPlan(client: Client, tripId: string, plan: SeedPlan): Promise<void> {
  const db = client as unknown as SupabaseClient;
  const inserted: { table: string; ids: string[] }[] = [];

  try {
    for (const table of INSERT_ORDER) {
      const rows = plan.rows[table];
      if (rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, trip_id: tripId }));
        const { error } = await db.from(table).insert(chunk);
        if (error) throw new Error(`${table}: ${error.message}`);
        inserted.push({ table, ids: chunk.map((r) => r.id) });
      }
    }
    for (const u of plan.categoryUpdates) {
      const { error } = await client
        .from("categories")
        .update({ planned: u.planned, sort: u.sort })
        .eq("id", u.id)
        .eq("trip_id", tripId);
      if (error) throw new Error(`categories: ${error.message}`);
    }
    const { error } = await client.from("trips").update(plan.trip).eq("id", tripId);
    if (error) throw new Error(`trip settings: ${error.message}`);
  } catch (err) {
    for (const { table, ids } of inserted.reverse()) {
      await db.from(table).delete().in("id", ids).eq("trip_id", tripId);
    }
    throw err;
  }
}
