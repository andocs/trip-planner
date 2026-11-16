import { searchPlaces } from "@/lib/places/google";
import { placesRoute } from "@/lib/places/route";
import { SearchBody } from "@/lib/places/schemas";

/** Owner only. One Text Search call (Enterprise+Atmosphere tier, reserved against the monthly cap) returns about 20 cards. */
export async function POST(request: Request) {
  return placesRoute(request, SearchBody, { sku: "text_search_atmosphere", needsGoogleKey: true }, async (body) => ({
    places: await searchPlaces(body),
  }));
}
