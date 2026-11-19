/**
 * Trips have their own addresses: /t/<trip id>/itinerary. The older bare addresses (/itinerary, /) still work and mean "the trip
 * joined last". Pure helpers, shared by the server prefetch and the client.
 */
const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TRIP_PATH = new RegExp(`^/t/(${ID})(/.*)?$`, "i");

/** The trip id in an address like /t/<id>/places, or null for a bare address. */
export function tripIdFromPath(pathname: string | null | undefined): string | null {
  const m = pathname ? TRIP_PATH.exec(pathname) : null;
  return m ? m[1].toLowerCase() : null;
}

/** The screen part of an address: /t/<id>/places -> /places, /t/<id> -> /, /places -> /places. */
export function screenPath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const m = TRIP_PATH.exec(pathname);
  if (!m) return pathname;
  return m[2] && m[2] !== "/" ? m[2] : "/";
}

/** An internal link for a screen, inside a trip when the page is showing one by id (otherwise left bare). */
export function withTrip(tripId: string | null, href: string): string {
  if (!tripId || !href.startsWith("/")) return href;
  if (href === "/") return `/t/${tripId}`;
  return `/t/${tripId}${href}`;
}
