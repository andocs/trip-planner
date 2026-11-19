import type { Database } from "@/lib/database.types";

export type TableName = keyof Database["public"]["Tables"];

/** One key family per table, so a realtime event for a table invalidates exactly its queries. */
export const qk = {
  user: ["user"] as const,
  // Per requested trip: an id from the address, or "last" (the trip joined last) when the page named none.
  bootstrap: (requested: string | null) => ["bootstrap", requested ?? "last"] as const,
  admin: ["is-admin"] as const,
  role: (tripId: string) => ["trip-role", tripId] as const,
  claimable: ["claimable-trips"] as const,
  myTrips: ["my-trips"] as const,
  members: (tripId: string) => ["trip-members", tripId] as const,
  /** Prefix of every open-trip entry: use it to invalidate or update them all. */
  activeTrip: ["active-trip"] as const,
  /** The open trip for one requested id (or "last"). */
  openTrip: (requested: string | null) => ["active-trip", requested ?? "last"] as const,
  table: (table: TableName, tripId: string) => ["trip", tripId, table] as const,
};
