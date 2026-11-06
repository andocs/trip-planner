import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs on every page navigation:
 *  1. Refresh the Supabase session cookie so server code sees a valid token.
 *  2. Invite-only gate: a visitor with no session sees only the "Invite only" page, on every route.
 *     Exempt: the invite link itself, sign-in, and the OAuth return.
 *
 * This is an optimistic check (the docs' own advice for proxy). The real enforcement is the database:
 * row-level security answers every query by role, so a forged cookie still reads nothing.
 * It never creates users: anonymous sign-in happens only on /join, so crawlers and link previews
 * never create accounts.
 */
const OPEN = ["/join/", "/login", "/auth/", "/invite-only"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response;

  const { pathname } = request.nextUrl;
  const open = OPEN.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
  const hasCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const gate = () => NextResponse.rewrite(new URL("/invite-only", request.url));

  if (!hasCookie) return open ? response : gate();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
    // Supabase unreachable (not a rejected token): trust the cookie for this navigation; queries still need RLS.
    if (!signedIn && error && /fetch|network|retryable/i.test(`${error.name} ${error.message}`)) {
      const { data: s } = await supabase.auth.getSession();
      signedIn = !!s.session?.user;
    }
  } catch {
    const { data: s } = await supabase.auth.getSession();
    signedIn = !!s.session?.user;
  }

  if (!signedIn && !open) return gate();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|api/|.*\\.(?:png|svg|ico|webp|jpg)$).*)",
  ],
};
