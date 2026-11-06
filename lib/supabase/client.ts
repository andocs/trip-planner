"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

export type TripClient = SupabaseClient<Database>;

let client: TripClient | undefined;

/** One browser client per tab; the session lives in cookies so server code can read it. */
export function getSupabase(): TripClient {
  if (!client) {
    const { url, anonKey } = supabaseEnv();
    client = createBrowserClient<Database>(url, anonKey);
  }
  return client;
}

export type AppUser = { id: string; email: string | null; isAnonymous: boolean };

/** The signed-in user from the local session, or null. Never signs anyone in. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const { data } = await getSupabase().auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? null, isAnonymous: u.is_anonymous === true } : null;
}

/**
 * Anonymous sign-in. Only the invite-link page calls this: opening the app without a link or an
 * account must never create a session. Reuses an existing session if there is one.
 */
export async function signInForInvite(): Promise<AppUser> {
  const existing = await getCurrentUser();
  if (existing) return existing;
  const { data, error } = await getSupabase().auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not start a session. Is anonymous sign-in enabled in Supabase?");
  }
  return { id: data.user.id, email: null, isAnonymous: true };
}

const callback = (next: string) => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export async function signInWithGoogle(next = "/") {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback(next) },
  });
  if (error) throw error;
}

/** Attaches Google to the current (anonymous) session so a viewer keeps access across devices. */
export async function linkGoogle(next = "/") {
  const { error } = await getSupabase().auth.linkIdentity({
    provider: "google",
    options: { redirectTo: callback(next) },
  });
  if (error) throw error;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
