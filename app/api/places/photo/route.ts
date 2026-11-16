import { photoUri } from "@/lib/places/google";
import { placesRoute } from "@/lib/places/route";
import { PhotoBody } from "@/lib/places/schemas";

/**
 * Owner only. One Place Photos call (Photos SKU, reserved against the monthly cap). Returns ONLY the keyless,
 * short-lived photoUri (skipHttpRedirect=true); a URL that carries a key is never sent to the browser.
 */
export async function POST(request: Request) {
  return placesRoute(request, PhotoBody, { sku: "photos", needsGoogleKey: true }, async (body) => ({
    uri: await photoUri(body.name, body.maxWidth),
  }));
}
