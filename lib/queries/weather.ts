"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { tripLength, localISODate } from "@/lib/calc";
import { groupDays, isStop } from "@/lib/itinerary";
import { planRequests, roundCoord, type Request, type WeatherDay } from "@/lib/weather";
import { useClientValue } from "@/lib/use-client-value";
import { useCities } from "./places";
import type { Row } from "./table";

/** The weather service's answer through our own route (the browser never contacts the weather service itself). */
async function fetchDays(r: Request): Promise<WeatherDay[]> {
  const qs = new URLSearchParams({ lat: String(r.lat), lng: String(r.lng), from: r.from, to: r.to });
  const res = await fetch(`/api/weather?${qs}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("weather unavailable");
  const body = (await res.json()) as { days?: unknown };
  return Array.isArray(body.days) ? (body.days as WeatherDay[]) : [];
}

const key = (lat: number, lng: number, date: string) => `${roundCoord(lat)},${roundCoord(lng)}|${date}`;

/**
 * Weather for each dated day of the itinerary: a forecast for the next two weeks, "usually" (last year's weather on that date)
 * further out. Returns a lookup by date; days with no answer (no destination coordinates, past, or the service is down) simply
 * have none, and the itinerary looks exactly as it did before. Nothing is asked until the page is live (today is a browser value).
 * Weather is not written to the offline copy: it is quick to ask again and only useful while connected.
 */
export function useItineraryWeather(
  items: Row<"itinerary_items">[],
  start: string | null,
  end: string | null,
): (date: string | null) => WeatherDay | undefined {
  const cities = useCities();
  const today = useClientValue(() => localISODate(), null);

  const plan = useMemo(() => {
    if (!today || cities.length === 0) return { requests: [], placeOf: new Map() };
    const groups = groupDays(items, start, tripLength(start, end));
    const days = groups.flatMap((g) => (g.date ? [{ date: g.date, cities: g.items.filter(isStop).map((i) => i.city) }] : []));
    return planRequests(days, cities, today);
  }, [items, start, end, cities, today]);

  // One query per destination; `combine` merges their answers into one lookup by place and date.
  const byDay = useQueries({
    queries: plan.requests.map((r) => ({
      queryKey: ["weather", r.lat, r.lng, r.from, r.to] as const,
      queryFn: () => fetchDays(r),
      staleTime: 60 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => {
      const m = new Map<string, WeatherDay>();
      results.forEach((res, i) => {
        const r = plan.requests[i];
        if (r) for (const d of res.data ?? []) m.set(key(r.lat, r.lng, d.date), d);
      });
      return m;
    },
  });

  return (date) => {
    if (!date) return undefined;
    const place = plan.placeOf.get(date);
    return place ? byDay.get(key(place.lat, place.lng, date)) : undefined;
  };
}
