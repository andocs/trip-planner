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

/** PostgREST says "function not found" like this until the migration has been pushed. */
function isMissingFunction(error: { code?: string } | null) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Loads the bootstrap bundle in one RPC. If the migration isn't applied yet, falls back to the
 * original sequential calls (needs `user` to know whether to ask is_admin); with no user it returns null.
 * RPC errors other than "missing function" are thrown so the caller can show a retry.
 */
export async function fetchBootstrap(
  supabase: SupabaseClient<Database>,
  user: AppUser | null,
): Promise<Bootstrap | null> {
  const { data, error } = await supabase.rpc("trip_bootstrap");
  if (!error) return parseBootstrap(data);
  if (!isMissingFunction(error)) throw error;
  if (!user) return null;

  const active = await supabase.rpc("active_trip");
  if (active.error) throw active.error;
  const trip = active.data?.[0] ?? null;
  const admin = user.isAnonymous ? null : await supabase.rpc("is_admin");
  if (admin?.error) throw admin.error;
  const role = trip ? await supabase.rpc("trip_role", { t: trip.id }) : null;
  if (role?.error) throw role.error;
  return { user, trip, isAdmin: admin?.data === true, role: (role?.data as Role | null) ?? null };
}
