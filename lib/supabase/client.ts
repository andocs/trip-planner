"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { AppUser } from "@/lib/queries/bootstrap";
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

export type { AppUser };

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
/** Supabase refused guest (anonymous) sign-in: a project setting the owner has to switch on, not a problem with the link. */
export class GuestSignInOff extends Error {
  constructor() {
    super("Guest sign-in is switched off for this app");
    this.name = "GuestSignInOff";
  }
}

export async function signInForInvite(): Promise<AppUser> {
  const existing = await getCurrentUser();
  if (existing) return existing;
  const { data, error } = await getSupabase().auth.signInAnonymously();
  if (error && /anonymous sign-ins are disabled/i.test(error.message)) throw new GuestSignInOff();
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

/**
 * After Google is connected: fill the profile (name and photo) from the Google identity when linking left it empty, then
 * refresh the owner-visible copy of the email and name. Returns false when there is no Google identity yet, so nothing
 * was done. Safe to run again.
 */
export async function syncGoogleProfile(): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const google = u?.identities?.find((i) => i.provider === "google");
  if (!u || !google) return false;
  const idd = (google.identity_data ?? {}) as Record<string, unknown>;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const fullName = !text(meta.full_name) ? (text(idd.full_name) ?? text(idd.name)) : null;
  const avatar = !text(meta.avatar_url) ? (text(idd.avatar_url) ?? text(idd.picture)) : null;
  if (fullName || avatar) {
    const { error } = await supabase.auth.updateUser({ data: { ...(fullName ? { full_name: fullName } : {}), ...(avatar ? { avatar_url: avatar } : {}) } });
    if (error) throw error;
  }
  const { error } = await supabase.rpc("sync_my_membership");
  if (error) throw error;
  return true;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
