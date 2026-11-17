/**
 * Pure helpers for the flight boarding passes. Flight times are the LOCAL time at each airport (they are stored as
 * plain "2026-06-18T09:40" with no time zone), so:
 *  - the gap between one flight's arrival and the next flight's departure at the SAME airport is exact (a layover);
 *  - the length of a flight cannot be worked out from the two clock times (Manila and Hanoi are an hour apart), so it
 *    is only shown when the owner types it in.
 */

import { travelMinutes } from "./timezones";

type Stamp = string | null | undefined;

const ms = (ts: Stamp): number | null => {
  if (!ts || ts.length < 16) return null;
  const n = Date.parse(`${ts.slice(0, 16)}:00Z`); // read as wall-clock time, never shifted by the machine's time zone
  return Number.isFinite(n) ? n : null;
};

export const minutesBetween = (from: Stamp, to: Stamp): number | null => {
  const a = ms(from);
  const b = ms(to);
  return a === null || b === null ? null : Math.round((b - a) / 60000);
};

/** "3h 40m", "2h", "45m". */
export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

/** "3h 40m", "3h", "45m", "3:40" or "220" (minutes) -> minutes. null for anything else. */
export function parseDuration(text: string | null | undefined): number | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null;
  m = /^(?:(\d{1,2})\s*h(?:ours?|rs?)?)?\s*(?:(\d{1,3})\s*m(?:in(?:ute)?s?)?)?$/.exec(t);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) || null;
  m = /^(\d{1,4})$/.exec(t);
  if (m) return Number(m[1]) || null;
  return null;
}

/** Days between the two dates on the tickets: 1 when you land the next day ("+1"). */
export function arrivalDayOffset(departs: Stamp, arrives: Stamp): number {
  if (!departs || !arrives) return 0;
  const a = Date.parse(`${departs.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${arrives.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
}

type Leg = {
  id: string;
  from_code: string | null;
  to_code: string | null;
  departs_at: string | null;
  arrives_at: string | null;
};

/** A connection: the next flight leaves from the airport the last one reached, within 24 hours. Returns the layover. */
export function layoverBetween(prev: Leg, next: Leg): { minutes: number; airport: string } | null {
  const a = prev.to_code?.trim().toUpperCase();
  const b = next.from_code?.trim().toUpperCase();
  if (!a || a !== b) return null;
  const minutes = minutesBetween(prev.arrives_at, next.departs_at);
  return minutes !== null && minutes > 0 && minutes <= 24 * 60 ? { minutes, airport: a } : null;
}

/** Each flight with the layover that comes before it (null when it is not a connection). Input must be sorted by departure. */
export function withLayovers<T extends Leg>(
  sorted: T[],
): { flight: T; layover: { minutes: number; airport: string } | null }[] {
  return sorted.map((flight, i) => ({ flight, layover: i === 0 ? null : layoverBetween(sorted[i - 1], flight) }));
}

/** "••••••" for a booking reference nobody should read. */
export const MASKED_REF = "••••••";

/** Statuses whose pass is drawn as a plain idea (dashed, not in the plan). */
export const isIdeaStatus = (status: string) => status === "Idea" || status === "Maybe";

/**
 * How long a flight is. The owner's typed time wins; otherwise it is worked out from the two local times and the zone of
 * each airport, but only when BOTH zones were set (a flight saved before zones existed has none, and guessing Manila at
 * both ends would give a wrong time).
 */
export function flightMinutes(f: {
  duration_min?: number | null;
  departs_at?: string | null;
  arrives_at?: string | null;
  dep_tz?: string | null;
  arr_tz?: string | null;
}): number | null {
  if (f.duration_min) return f.duration_min;
  if (!f.dep_tz || !f.arr_tz) return null;
  return travelMinutes({ local: f.departs_at, zone: f.dep_tz }, { local: f.arrives_at, zone: f.arr_tz });
}
