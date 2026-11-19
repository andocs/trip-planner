import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { bareRedirect, LAST_TRIP_COOKIE, LATEST_PARAM } from "@/lib/last-trip";

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
const OPEN = ["/join/", "/share/", "/login", "/auth/", "/invite-only"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  // Tell server code which screen a cold load is for (so it prefetches only that screen's tables).
  // Set here, so a value sent by the client is overwritten.
  request.headers.set("x-pathname", pathname);

  // A bare screen address opens the trip this browser had open last (also in a new tab). "?latest" opts out and forgets it.
  if (request.method === "GET" || request.method === "HEAD") {
    const to = bareRedirect(pathname, request.cookies.get(LAST_TRIP_COOKIE)?.value, request.nextUrl.searchParams);
    if (to) return NextResponse.redirect(new URL(`${to}${request.nextUrl.search}`, request.url));
  }
  let response = NextResponse.next({ request });
  if (request.nextUrl.searchParams.has(LATEST_PARAM)) response.cookies.set(LAST_TRIP_COOKIE, "", { path: "/", maxAge: 0 });
  if (!url || !anonKey) return response;

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
    // sw.js and offline.html are static files with no data: the gate must not rewrite them (a service worker script must be JavaScript).
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|api/|.*\\.(?:png|svg|ico|webp|jpg)$).*)",
  ],
};
