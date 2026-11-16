import { z } from "zod";
import type { PlaceCard } from "./types";

/** Turns Google's response into our own small shapes. Anything unexpected is dropped, never passed through. */

const Author = z.object({ displayName: z.string().max(200).optional(), uri: z.string().max(500).optional() });
const Photo = z.object({ name: z.string(), authorAttributions: z.array(Author).optional() });
const Hours = z.object({
  openNow: z.boolean().optional(),
  weekdayDescriptions: z.array(z.string().max(120)).max(7).optional(),
});

const GPlace = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  formattedAddress: z.string().max(300).optional(),
  googleMapsUri: z.string().max(500).optional(),
  primaryType: z.string().max(60).optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().min(0).optional(),
  priceLevel: z.string().optional(),
  regularOpeningHours: Hours.optional(),
  editorialSummary: z.object({ text: z.string().max(600) }).optional(),
  photos: z.array(Photo).optional(),
});

export const SearchResponse = z.object({ places: z.array(z.unknown()).optional() });
export const DetailsResponse = z.object({ id: z.string().optional(), regularOpeningHours: Hours.optional() });
export const PhotoMediaResponse = z.object({ photoUri: z.string().optional() });

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** "tourist_attraction" -> "Tourist attraction". Our own label, so no extra (billed) field is needed. */
export const typeLabel = (t: string | undefined) =>
  t ? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null;

/** Only links that really point at Google Maps are passed on, so a response can never smuggle in another site. */
export function safeMapsUri(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const ok =
      url.protocol === "https:" &&
      /^(www\.)?(google\.com|maps\.google\.com|goo\.gl|maps\.app\.goo\.gl)$/.test(url.hostname);
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The link we build ourselves from a saved place ID. No key, no Google call. */
export const mapsLinkFor = (placeId: string) =>
  `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;

export function toCard(raw: unknown): PlaceCard | null {
  const p = GPlace.safeParse(raw);
  if (!p.success || !p.data.displayName || !p.data.location) return null;
  const d = p.data;
  const photo = d.photos?.[0];
  return {
    id: d.id,
    name: d.displayName!.text.slice(0, 160),
    lat: Math.round(d.location!.latitude * 1e6) / 1e6,
    lng: Math.round(d.location!.longitude * 1e6) / 1e6,
    address: d.formattedAddress ?? null,
    type: typeLabel(d.primaryType),
    rating: d.rating ?? null,
    ratingCount: d.userRatingCount ?? null,
    priceLevel: d.priceLevel !== undefined ? (PRICE[d.priceLevel] ?? null) : null,
    openNow: d.regularOpeningHours?.openNow ?? null,
    description: d.editorialSummary?.text.trim().slice(0, 300) || null,
    mapsUri: safeMapsUri(d.googleMapsUri),
    photo: photo
      ? {
          name: photo.name,
          authors: (photo.authorAttributions ?? [])
            .filter((a) => a.displayName)
            .slice(0, 3)
            .map((a) => ({ name: a.displayName!, uri: a.uri && /^https:\/\//.test(a.uri) ? a.uri : null })),
        }
      : null,
  };
}

export function toCards(body: unknown): PlaceCard[] {
  const parsed = SearchResponse.safeParse(body);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: PlaceCard[] = [];
  for (const raw of parsed.data.places ?? []) {
    const card = toCard(raw);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

/** A photo URL is only handed to the browser if it is https and carries no key. */
export function keylessPhotoUri(u: string | undefined): string | null {
  if (!u || !u.startsWith("https://")) return null;
  return /[?&]key=/i.test(u) || /AIza[0-9A-Za-z_-]{20,}/.test(u) ? null : u;
}
