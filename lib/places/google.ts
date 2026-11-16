import "server-only";

import { DETAILS_MASK, SEARCH_MASK, tierOf } from "./fields";
import { DetailsResponse, PhotoMediaResponse, keylessPhotoUri, toCards } from "./normalize";
import { QUERY, type SearchBody } from "./schemas";
import type { GooglePhoto, PlaceCard, PlaceDetails, PlacesErrorCode } from "./types";

/**
 * The only place that talks to Google. Rules (Phase 3.6):
 *  - the key comes from GOOGLE_MAPS_SERVER_KEY and is sent ONLY in the X-Goog-Api-Key header, never in a URL;
 *  - Google's response bodies, headers and URLs are never logged or forwarded: a failure becomes a PlacesError
 *    with a fixed code;
 *  - a photo URL is only returned if it is https and has no key in it (skipHttpRedirect=true gives a keyless one).
 * GOOGLE_PLACES_BASE_URL exists only so the e2e tests can point at a fake server; it is server-side configuration.
 */
export class PlacesError extends Error {
  constructor(readonly code: PlacesErrorCode) {
    super(code);
    this.name = "PlacesError";
  }
}

const base = () => (process.env.GOOGLE_PLACES_BASE_URL || "https://places.googleapis.com").replace(/\/$/, "");
const key = () => {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!k) throw new PlacesError("not_configured");
  return k;
};

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; mask?: string }): Promise<unknown> {
  const headers: Record<string, string> = { "X-Goog-Api-Key": key() };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.mask) headers["X-Goog-FieldMask"] = init.mask;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new PlacesError("unavailable");
    return await res.json();
  } catch (e) {
    throw e instanceof PlacesError ? e : new PlacesError("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** One Text Search call: up to 20 cards for a city and kind. Billed at the tier of SEARCH_MASK (Enterprise+Atmosphere). */
export async function searchPlaces(body: SearchBody): Promise<PlaceCard[]> {
  tierOf(SEARCH_MASK); // throws if a field is unknown to the billing table
  const q = QUERY[body.kind];
  const json = await call("/v1/places:searchText", {
    method: "POST",
    mask: SEARCH_MASK,
    body: {
      textQuery: q.text(body.city.name),
      includedType: q.type,
      pageSize: 20,
      languageCode: "en",
      locationBias: { circle: { center: { latitude: body.city.lat, longitude: body.city.lng }, radius: 15000 } },
    },
  });
  return toCards(json);
}

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  tierOf(DETAILS_MASK);
  const json = await call(`/v1/places/${encodeURIComponent(placeId)}`, { method: "GET", mask: DETAILS_MASK });
  const parsed = DetailsResponse.safeParse(json);
  if (!parsed.success) throw new PlacesError("unavailable");
  const hours = parsed.data.regularOpeningHours;
  return { id: placeId, weekdayText: hours?.weekdayDescriptions ?? [], openNow: hours?.openNow ?? null };
}

/** One Place Photos media call (Photos SKU). Returns the short-lived keyless photoUri. */
export async function photoUri(name: string, maxWidth: number): Promise<string> {
  const json = await call(`/v1/${name}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true`, { method: "GET" });
  const parsed = PhotoMediaResponse.safeParse(json);
  const uri = parsed.success ? keylessPhotoUri(parsed.data.photoUri) : null;
  if (!uri) throw new PlacesError("unavailable");
  return uri;
}

export type { GooglePhoto };
