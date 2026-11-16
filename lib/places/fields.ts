/**
 * Google Places API (New) field masks and the billing tier of every field we ever request.
 * A request is billed at the HIGHEST tier of any field in its mask, so adding one field can change
 * the price of every call. `tierOf` throws on a field that is not listed here: add it only after
 * checking the official data-fields page (never guess), and update fields.test.ts.
 * Tiers checked against developers.google.com/maps/documentation/places/web-service/data-fields on 2026-11-07.
 */
export type Tier = "IDs Only" | "Essentials" | "Pro" | "Enterprise" | "Enterprise+Atmosphere";

const TIER: Record<string, Tier> = {
  id: "IDs Only",
  name: "IDs Only",
  photos: "IDs Only",
  formattedAddress: "Essentials",
  location: "Essentials",
  types: "Essentials",
  displayName: "Pro",
  googleMapsUri: "Pro",
  primaryType: "Pro",
  rating: "Enterprise",
  userRatingCount: "Enterprise",
  priceLevel: "Enterprise",
  regularOpeningHours: "Enterprise",
  editorialSummary: "Enterprise+Atmosphere",
  reviews: "Enterprise+Atmosphere",
};
const ORDER: Tier[] = ["IDs Only", "Essentials", "Pro", "Enterprise", "Enterprise+Atmosphere"];

export function tierOf(mask: string): Tier {
  let top = 0;
  for (const raw of mask.split(",")) {
    const field = raw.trim().replace(/^places\./, "");
    const tier = TIER[field];
    if (!tier) throw new Error(`Unknown Places field "${field}": check its billing tier before using it`);
    top = Math.max(top, ORDER.indexOf(tier));
  }
  return ORDER[top];
}

/** A card: name, rating, price level, hours-now, short description, address, type, photo reference, link. One Text Search call returns about 20. Billed at Enterprise+Atmosphere because of editorialSummary. */
export const SEARCH_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours",
  "places.editorialSummary",
  "places.photos",
].join(",");

/** Opening a place: its weekly hours. */
export const DETAILS_MASK = "id,regularOpeningHours";

/** The quota SKUs reserved before a call. Keep in step with api_caps in the migration. */
export type Sku = "text_search_atmosphere" | "details_enterprise" | "photos";
