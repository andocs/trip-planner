/**
 * Defence in depth for POST routes: a request that the browser says came from another site is refused.
 * The session cookie is SameSite=Lax already, so this is a second lock, not the first one.
 * Requests with neither header (scripts, curl, server-to-server) pass: they cannot ride a victim's cookie.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      if (!host || new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
