import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

export type Trip = Tables<"trips">;
export type Role = "owner" | "editor" | "viewer";
export type AppUser = { id: string; email: string | null; isAnonymous: boolean };

/** Everything the gate needs, from one call: the caller, their active trip, admin flag and role. */
export type Bootstrap = { user: AppUser; trip: Trip | null; isAdmin: boolean; role: Role | null };

/** Shape of the JSON returned by the `trip_bootstrap()` RPC. Null/garbage in, null out. */
export function parseBootstrap(raw: unknown): Bootstrap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const u = r.user as Record<string, unknown> | null | undefined;
  if (!u || typeof u.id !== "string") return null;
  const role = r.role === "owner" || r.role === "editor" || r.role === "viewer" ? r.role : null;
  return {
    user: { id: u.id, email: typeof u.email === "string" ? u.email : null, isAnonymous: u.is_anonymous === true },
    trip: r.trip && typeof r.trip === "object" ? (r.trip as Trip) : null,
    isAdmin: r.is_admin === true,
    role,
  };
}

/**
 * Loads the bootstrap bundle in one RPC (migration 8). With a trip id (migration 34) it is that trip, and a trip the caller
 * is not on comes back as trip = null; without one it is the trip joined last. Any RPC error is thrown so the caller can show a retry.
 */
export async function fetchBootstrap(supabase: SupabaseClient<Database>, tripId?: string | null): Promise<Bootstrap | null> {
  const { data, error } = tripId ? await supabase.rpc("trip_bootstrap", { p_trip: tripId }) : await supabase.rpc("trip_bootstrap");
  if (error) throw error;
  return parseBootstrap(data);
}
