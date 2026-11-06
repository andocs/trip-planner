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
