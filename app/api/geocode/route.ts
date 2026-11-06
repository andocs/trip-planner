import { cacheLife } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/require-user";

/**
 * Nominatim usage policy: identify the app in User-Agent, at most 1 request/second, cache results.
 * https://operations.osmfoundation.org/policies/nominatim/
 * Set NOMINATIM_USER_AGENT (e.g. "TripPlanner/1.0 (you@example.com)") for a proper identity;
 * GEOCODER_CONTACT is still honoured and appended to the default.
 */
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  `TripPlanner/0.1 (self-hosted trip planning app${process.env.GEOCODER_CONTACT ? `; ${process.env.GEOCODER_CONTACT}` : ""})`;
const BASE = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org";

const Hit = z.object({
  lat: z.string(),
  lon: z.string(),
  name: z.string().optional(),
  display_name: z.string(),
  address: z.record(z.string(), z.string()).optional(),
});
const Hits = z.array(Hit);

/**
 * Nominatim allows 1 request per second. Lookups run one at a time, each followed by a
 * 1.1 s pause. This is a promise queue rather than a clock check because Cache Components
 * forbids Date.now() inside cached functions. Per server instance, which is plenty here.
 */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return run;
}

export type Place = {
  lat: number;
  lng: number;
  label: string;
  name: string;
  country: string | null;
  countryCode: string | null;
};

const round = (n: number) => Math.round(n * 1e4) / 1e4;

function toPlace(hit: z.infer<typeof Hit>): Place {
  const a = hit.address ?? {};
  const name =
    hit.name ||
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.county ||
    a.state ||
    hit.display_name.split(",")[0];
  return {
    lat: round(Number(hit.lat)),
    lng: round(Number(hit.lon)),
    label: hit.display_name,
    name,
    country: a.country ?? null,
    countryCode: a.country_code?.toUpperCase() ?? null,
  };
}

async function nominatim(path: string, params: Record<string, string>) {
  const url = new URL(path, BASE);
  url.search = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "en",
    ...params,
  }).toString();
  const res = await oneAtATime(() => fetch(url, { headers: { "User-Agent": USER_AGENT } }));
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  return res.json();
}

/** Cached per query for weeks: city coordinates don't move. */
async function search(q: string, limit: number) {
  "use cache";
  cacheLife("weeks");
  return Hits.parse(await nominatim("/search", { q, limit: String(limit) })).map(toPlace);
}

async function reverse(lat: number, lng: number) {
  "use cache";
  cacheLife("weeks");
  const body = await nominatim("/reverse", { lat: String(lat), lon: String(lng), zoom: "10" });
  const parsed = Hit.safeParse(body);
  return parsed.success ? toPlace(parsed.data) : null;
}

/**
 * Owner only.
 *   GET /api/geocode?q=Hanoi, Vietnam           → one place (used by Settings "Find coordinates")
 *   GET /api/geocode?q=Hanoi&suggest=1          → { results: Place[] } (wizard search box)
 *   GET /api/geocode?lat=21.03&lng=105.85       → one place (tap on the map)
 */
export async function GET(request: Request) {
  if (!(await requireUserId())) return Response.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const cache = { "Cache-Control": "private, max-age=86400" };
  try {
    if (params.has("lat") || params.has("lng")) {
      const lat = Number(params.get("lat"));
      const lng = Number(params.get("lng"));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return Response.json({ error: "Invalid coordinates" }, { status: 400 });
      }
      const place = await reverse(round(lat), round(lng));
      if (!place)
        return Response.json({ error: "Nothing known at that spot. Try searching instead." }, { status: 404 });
      return Response.json(place, { headers: cache });
    }

    const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (q.length < 2 || q.length > 120) return Response.json({ error: "Enter a city name" }, { status: 400 });

    if (params.get("suggest")) {
      return Response.json({ results: await search(q.toLowerCase(), 5) }, { headers: cache });
    }
    const [hit] = await search(q.toLowerCase(), 1);
    if (!hit) return Response.json({ error: `Couldn't find "${q}". Try adding the country.` }, { status: 404 });
    return Response.json(hit, { headers: cache });
  } catch {
    return Response.json({ error: "The map search is unavailable. Type the coordinates instead." }, { status: 502 });
  }
}
