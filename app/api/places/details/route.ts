import { placeDetails } from "@/lib/places/google";
import { placesRoute } from "@/lib/places/route";
import { DetailsBody } from "@/lib/places/schemas";

/** Owner only. Asking to see a place’s weekly opening hours (Enterprise tier, reserved against the monthly cap). */
export async function POST(request: Request) {
  return placesRoute(request, DetailsBody, { sku: "details_enterprise", needsGoogleKey: true }, async (body) =>
    placeDetails(body.placeId),
  );
}
