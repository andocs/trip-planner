import "server-only";

import { createSupabaseServer } from "./server";

/**
 * The signed-in user id, only if the caller is the trip owner (a Google account listed in app_admins).
 * Keeps API routes from being open proxies: viewers never need geocoding or live rates.
 */
export async function requireUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims.sub;
    if (!id || data.claims.is_anonymous === true) return null;
    const { data: admin } = await supabase.rpc("is_admin");
    return admin === true ? id : null;
  } catch {
    return null;
  }
}

// Remembered per person AND trip: being on one trip says nothing about another.
const memberUntil = new Map<string, number>();
const MEMBER_TTL_MS = 5 * 60_000;

/**
 * The signed-in user id, for anyone who is a member of THIS trip (owner, editor or viewer, guests included, not revoked), or null.
 * For routes every traveler may use (weather) but that must not be an open proxy: a guest account can be created by anyone
 * with the public key, so being signed in is not enough; having joined the trip is. A yes is remembered for a few minutes.
 * The trip comes from the request; membership is checked by the database (`trip_by_id`, migration 34), never trusted from the client.
 */
export async function requireMemberId(tripId: string): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims.sub;
    if (!id) return null;
    const now = Date.now();
    const cacheKey = `${id}:${tripId}`;
    if ((memberUntil.get(cacheKey) ?? 0) > now) return id;
    const { data: trips } = await supabase.rpc("trip_by_id", { p_trip: tripId });
    if (!Array.isArray(trips) || trips.length === 0) return null;
    if (memberUntil.size > 500) for (const [k, t] of memberUntil) if (t <= now) memberUntil.delete(k);
    memberUntil.set(cacheKey, now + MEMBER_TTL_MS);
    return id;
  } catch {
    return null;
  }
}
