import { createClient } from "@supabase/supabase-js";
import { dateForDay } from "@/lib/itinerary";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * The read-only share link (migration 30). `shared_trip(token)` returns a small fixed slice of the trip to anyone holding
 * the token, with no sign-in. What is in the slice is decided in the database; this file only reads it defensively,
 * because the page is public: every field is checked, nothing is trusted to be present, and nothing is rendered as HTML.
 */

export type SharedStop = {
  day: number | null;
  onDate: string | null;
  atTime: string | null;
  durationMin: number | null;
  activity: string;
  city: string | null;
  type: string | null;
  tentative: boolean;
};
export type SharedFlight = {
  airline: string | null;
  flightNo: string | null;
  from: string | null;
  to: string | null;
  departsAt: string | null;
  arrivesAt: string | null;
  terminal: string | null;
  status: string | null;
};
export type SharedStay = { hotel: string; city: string | null; checkIn: string | null; checkOut: string | null };
export type SharedTrip = {
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  itinerary: SharedStop[];
  flights: SharedFlight[];
  stays: SharedStay[];
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
const list = (v: unknown, max = 500): Obj[] => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : []);

/** The RPC's JSON -> a typed, trimmed trip. Null when it isn't a trip at all (an unknown or revoked link). */
export function parseShared(raw: unknown): SharedTrip | null {
  if (!isObj(raw) || !isObj(raw.trip)) return null;
  const t = raw.trip;
  const name = str(t.name, 120);
  if (!name) return null;
  return {
    name,
    destination: str(t.destination, 120),
    startDate: str(t.start_date, 10),
    endDate: str(t.end_date, 10),
    itinerary: list(raw.itinerary).flatMap((i) => {
      const activity = str(i.activity, 160);
      return activity
        ? [{ day: int(i.day), onDate: str(i.on_date, 10), atTime: str(i.at_time, 8), durationMin: int(i.duration_min), activity, city: str(i.city, 80), type: str(i.type, 40), tentative: i.tentative === true }]
        : [];
    }),
    flights: list(raw.flights, 100).map((f) => ({
      airline: str(f.airline, 80),
      flightNo: str(f.flight_no, 20),
      from: str(f.from_code, 8),
      to: str(f.to_code, 8),
      departsAt: str(f.departs_at, 25),
      arrivesAt: str(f.arrives_at, 25),
      terminal: str(f.terminal, 20),
      status: str(f.status, 20),
    })),
    stays: list(raw.stays, 100).flatMap((s) => {
      const hotel = str(s.hotel, 120);
      return hotel ? [{ hotel, city: str(s.city, 80), checkIn: str(s.check_in, 10), checkOut: str(s.check_out, 10) }] : [];
    }),
  };
}

export type ShareDay = { day: number | null; date: string | null; stops: SharedStop[] };

/** Stops grouped by trip day, in the order the owner arranged them (the database already sorted them). Undated last. */
export function groupShared(stops: SharedStop[], startDate: string | null): ShareDay[] {
  const by = new Map<number | null, SharedStop[]>();
  for (const s of stops) by.set(s.day, [...(by.get(s.day) ?? []), s]);
  return [...by.entries()]
    .sort(([a], [b]) => (a ?? 9999) - (b ?? 9999))
    .map(([day, list]) => ({ day, date: dateForDay(startDate, day) ?? list.find((s) => s.onDate)?.onDate ?? null, stops: list }));
}

/** A client with no session: the page is public and must never read, create or refresh anyone's sign-in. */
export async function fetchShared(token: string): Promise<SharedTrip | null> {
  const { url, anonKey } = supabaseEnv();
  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await db.rpc("shared_trip", { p_token: token });
  if (error) throw new Error("The shared trip could not be loaded.");
  return parseShared(data);
}
