import "server-only";

import { createSupabaseServer } from "./server";

/** Returns the signed-in user id (anonymous counts) or null. Used to keep API routes from being open proxies. */
export async function requireUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    return data?.claims.sub ?? null;
  } catch {
    return null;
  }
}
