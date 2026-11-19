import { z } from "zod";
import { createCache, createLimiter } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { requireMemberId } from "@/lib/supabase/require-user";
import { daysBetween, isIsoDate, MAX_SPAN_DAYS, roundCoord, type WeatherDay } from "@/lib/weather";
import { weatherFor } from "@/lib/weather-server";

const Query = z
  .object({
    trip: z.uuid(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    from: z.string().refine(isIsoDate),
    to: z.string().refine(isIsoDate),
  })
  .refine((q) => q.from <= q.to && daysBetween(q.from, q.to) < MAX_SPAN_DAYS, "range");

const allow = createLimiter(60);
const cache = createCache<WeatherDay[]>(60 * 60_000);

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/weather?trip=<trip id>&lat=&lng=&from=YYYY-MM-DD&to=YYYY-MM-DD -> { days: WeatherDay[] }
 * For anyone who has joined THAT trip (checked against the trip id in the request). The place is rounded to about 1 km before it goes anywhere, and nothing about the trip or
 * the person is sent to the weather service (see lib/weather-server.ts). Cached for an hour per place and date range.
 */
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden");
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) return fail(400, "Use a trip, lat, lng and a date range of at most a month");
  const userId = await requireMemberId(parsed.data.trip);
  if (!userId) return fail(401, "Not signed in");
  if (!allow(userId)) return fail(429, "Too many requests. Try again in a moment.");

  // Rounded here, not just in the client: whatever is asked for, only a ~1 km place is used and shared.
  const q = { lat: roundCoord(parsed.data.lat), lng: roundCoord(parsed.data.lng), from: parsed.data.from, to: parsed.data.to };
  const today = new Date().toISOString().slice(0, 10);
  const key = `${q.lat},${q.lng},${q.from},${q.to},${today}`;
  try {
    const days = cache.get(key) ?? (await weatherFor(q, { fetch, today }));
    cache.set(key, days);
    return Response.json({ days }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return fail(502, "Weather isn't available right now.");
  }
}

