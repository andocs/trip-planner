"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

export type TripClient = SupabaseClient<Database>;

let client: TripClient | undefined;

/** One browser client per tab; the session lives in cookies so server actions can read it. */
export function getSupabase(): TripClient {
  if (!client) {
    const { url, anonKey } = supabaseEnv();
    client = createBrowserClient<Database>(url, anonKey);
  }
  return client;
}

let signingIn: Promise<string> | undefined;

/**
 * Returns the current user id, signing in anonymously the first time.
 * Concurrent callers share one sign-in so a fresh tab never creates two users.
 */
export function ensureUser(): Promise<string> {
  signingIn ??= (async () => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session.user.id;
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signIn.user) {
      throw new Error(error?.message ?? "Could not start a session. Is anonymous sign-in enabled in Supabase?");
    }
    return signIn.user.id;
  })().finally(() => {
    signingIn = undefined;
  });
  return signingIn;
}
