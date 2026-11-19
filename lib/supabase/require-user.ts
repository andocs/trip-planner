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

const memberUntil = new Map<string, number>();
const MEMBER_TTL_MS = 5 * 60_000;

/**
 * The signed-in user id, for anyone who is a member of a trip (owner, editor or viewer, guests included), or null.
 * For routes every traveler may use (weather) but that must not be an open proxy: a guest account can be created by anyone
 * with the public key, so being signed in is not enough; having joined a trip is. A yes is remembered for a few minutes.
 */
export async function requireMemberId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims.sub;
    if (!id) return null;
    const now = Date.now();
    if ((memberUntil.get(id) ?? 0) > now) return id;
    const { data: trips } = await supabase.rpc("active_trip");
    if (!Array.isArray(trips) || trips.length === 0) return null;
    if (memberUntil.size > 500) for (const [k, t] of memberUntil) if (t <= now) memberUntil.delete(k);
    memberUntil.set(id, now + MEMBER_TTL_MS);
    return id;
  } catch {
    return null;
  }
}
