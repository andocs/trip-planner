import { tripIdFromPath, withTrip } from "@/lib/trip-path";

/**
 * The trip a person last had open, remembered in a cookie (the id only; the database still decides what they may see).
 * A bare address such as /itinerary then opens that trip instead of "the trip joined last", also in a new tab.
 * "/?latest=1" is the way back to the trip joined last (it clears the memory).
 */
export const LAST_TRIP_COOKIE = "tp-last-trip";
export const LATEST_PARAM = "latest";

const BARE_SCREEN = /^\/(?:itinerary|places|stays|flights|spend|pack|settings)?$/;

/** The cookie text that remembers a trip (set from the browser). */
export function rememberTripCookie(tripId: string, secure: boolean): string {
  return `${LAST_TRIP_COOKIE}=${tripId}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The cookie text that forgets it. */
export const forgetTripCookie = `${LAST_TRIP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

/**
 * Where a bare address should go: /t/<remembered id>/<screen>, or null to leave it alone (not a bare screen, nothing
 * remembered, the remembered value is not a trip id, or "?latest" was asked for).
 */
export function bareRedirect(pathname: string, remembered: string | null | undefined, search: URLSearchParams): string | null {
  if (!remembered || !BARE_SCREEN.test(pathname) || search.has(LATEST_PARAM)) return null;
  const id = tripIdFromPath(`/t/${remembered}`);
  return id ? withTrip(id, pathname) : null;
}
