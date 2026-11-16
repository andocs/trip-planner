/** Shapes shared by the Places routes and the Discover screen. No server-only code here. */

export type PlaceKind = "sight" | "food" | "stay";

export type PhotoAuthor = { name: string; uri: string | null };

/** One suggestion card. Google content: shown live, never stored (only `id` is kept, as a place ID). */
export type PlaceCard = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** Human label made from Google's primaryType, e.g. "Tourist attraction". */
  type: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** 0 free .. 4 very expensive. */
  priceLevel: number | null;
  openNow: boolean | null;
  /** Google's short editorial summary, when it has one. */
  description: string | null;
  mapsUri: string | null;
  /** First Google photo reference (not a URL): fetched on demand through /api/places/photo. */
  photo: { name: string; authors: PhotoAuthor[] } | null;
};

export type PlaceDetails = { id: string; weekdayText: string[]; openNow: boolean | null };

/** A freely licensed Wikimedia Commons image with what its licence requires us to show. */
export type WikiPhoto = {
  url: string;
  pageUrl: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string | null;
};

export type GooglePhoto = { uri: string; authors: PhotoAuthor[] };

/** Error codes the routes return. Messages are written for the owner and never contain Google's own text. */
export type PlacesErrorCode = "not_configured" | "cap" | "rate" | "unavailable" | "bad_request" | "forbidden";

export const PLACES_MESSAGES: Record<PlacesErrorCode, string> = {
  not_configured: "Suggestions aren't set up yet.",
  cap: "Suggestions are paused for this month to stay inside Google's free allowance.",
  rate: "That was a lot of searches in a minute. Wait a moment and try again.",
  unavailable: "Couldn't reach Google Maps. Your board and itinerary are fine.",
  bad_request: "That request wasn't valid.",
  forbidden: "Only the trip owner can use suggestions.",
};

export const KIND_LABEL: Record<PlaceKind, string> = { sight: "Sights", food: "Food", stay: "Stays" };
