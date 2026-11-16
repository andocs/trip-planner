import { placesRoute } from "@/lib/places/route";
import { ImageBody } from "@/lib/places/schemas";
import { findWikiPhoto } from "@/lib/places/wikimedia";

/**
 * Owner only. A free, freely licensed Wikimedia Commons photo for a place, with the licence and author the
 * licence requires us to show. No Google call and no key. Location is rounded so equal places share a cache entry.
 */
export async function POST(request: Request) {
  return placesRoute(request, ImageBody, { freePerMinute: 60 }, async (body) => ({
    photo: await findWikiPhoto(body.name, Math.round(body.lat * 1000) / 1000, Math.round(body.lng * 1000) / 1000),
  }));
}
