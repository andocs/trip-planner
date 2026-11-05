import { cacheLife } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/require-user";

/**
 * Nominatim usage policy: identify the app in User-Agent, at most 1 request/second, cache results.
 * https://operations.osmfoundation.org/policies/nominatim/
 * Set GEOCODER_CONTACT (e.g. a URL or email) to add a contact to the User-Agent.
 */
const USER_AGENT = `TripPlanner/0.1 (self-hosted trip planning app${
  process.env.GEOCODER_CONTACT ? `; ${process.env.GEOCODER_CONTACT}` : ""
})`;

const Results = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    address: z.record(z.string(), z.string()).optional(),
  }),
);

let lastCall = 0;
async function throttle() {
  const wait = lastCall + 1100 - Date.now();
  lastCall = Math.max(Date.now(), lastCall + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Cached per query for weeks: city coordinates don't move. */
async function geocode(q: string) {
  "use cache";
  cacheLife("weeks");
  await throttle();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    "accept-language": "en",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const [hit] = Results.parse(await res.json());
  if (!hit) return null;
  return {
    lat: Math.round(Number(hit.lat) * 1e4) / 1e4,
    lng: Math.round(Number(hit.lon) * 1e4) / 1e4,
    label: hit.display_name,
    country: hit.address?.country ?? null,
  };
}

/** GET /api/geocode?q=Hanoi, Vietnam → { lat, lng, label, country } */
export async function GET(request: Request) {
  if (!(await requireUserId())) return Response.json({ error: "Not signed in" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 120) return Response.json({ error: "Enter a city name" }, { status: 400 });

  try {
    const hit = await geocode(q.toLowerCase());
    if (!hit) return Response.json({ error: `Couldn't find "${q}". Try adding the country.` }, { status: 404 });
    return Response.json(hit, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return Response.json({ error: "The map search is unavailable. Type the coordinates instead." }, { status: 502 });
  }
}
