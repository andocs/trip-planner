import type { Database } from "@/lib/database.types";

export type TableName = keyof Database["public"]["Tables"];

/** One key family per table, so a realtime event for a table invalidates exactly its queries. */
export const qk = {
  user: ["user"] as const,
  activeTrip: ["active-trip"] as const,
  table: (table: TableName, tripId: string) => ["trip", tripId, table] as const,
};
