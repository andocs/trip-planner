import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import seed from "../seed/vietnam26.seed.json";
import type { Database } from "./database.types";
import { applySeedPlan } from "./seed-apply";
import { buildSeedPlan } from "./seed-map";

/** Minimal stand-in for the supabase-js query builder: records inserts/deletes, can fail one table. */
function fakeClient(failOn?: string) {
  const store = new Map<string, { id: string }[]>();
  const deletes: string[] = [];
  const result = (error: { message: string } | null) => ({ error, then: undefined });
  const chain = (done: () => { error: { message: string } | null }) => {
    const c = {
      eq: () => c,
      in: () => c,
      then: (resolve: (v: { error: { message: string } | null }) => void) => resolve(done()),
    };
    return c;
  };
  const client = {
    from: (table: string) => ({
      insert: async (rows: { id: string }[]) => {
        if (table === failOn) return result({ message: "boom" });
        store.set(table, [...(store.get(table) ?? []), ...rows]);
        return result(null);
      },
      update: () => chain(() => ({ error: null })),
      delete: () =>
        chain(() => {
          deletes.push(table);
          store.delete(table);
          return { error: null };
        }),
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, store, deletes };
}

const plan = () => buildSeedPlan(seed, [{ id: "c0", name: "Flights" }]);

describe("applySeedPlan", () => {
  it("inserts every table in foreign-key order", async () => {
    const { client, store } = fakeClient();
    await applySeedPlan(client, "trip", plan());
    expect([...store.keys()].slice(0, 4)).toEqual(["travelers", "destinations", "categories", "expenses"]);
    expect(store.get("itinerary_items")).toHaveLength(140);
    expect(store.get("expenses")?.every((r) => (r as { trip_id?: string }).trip_id === "trip")).toBe(true);
  });

  it("deletes what it inserted, newest first, when a later table fails", async () => {
    const { client, store, deletes } = fakeClient("flights");
    await expect(applySeedPlan(client, "trip", plan())).rejects.toThrow("flights: boom");
    expect(deletes).toEqual(["itinerary_items", "expenses", "categories", "destinations", "travelers"]);
    expect(store.size).toBe(0);
  });
});
