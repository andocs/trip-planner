import { addDays, dayNumberFor } from "./calc";
import { formatDuration, formatTime } from "./format";
import type { Json } from "./database.types";

/**
 * The itinerary's rules, with no React and no network so they are easy to test:
 * order within a day (one fractional number per row), commute / buffer connectors between places, day totals,
 * and the date shown for a day (derived from the trip start; the DAY NUMBER is what is stored).
 */

export type ItemKind = "stop" | "commute" | "buffer";
export type Item = {
  id: string;
  day: number | null;
  on_date?: string | null;
  at_time: string | null;
  activity: string;
  duration_min: number | null;
  created_at: string;
  position?: number | null;
  kind?: string | null;
  tentative?: boolean | null;
  city?: string | null;
  details?: unknown;
};

/** Over this many minutes in one day, the day gets a soft "long day" warning. A constant so it is easy to change. */
export const LONG_DAY_MINUTES = 10 * 60;
/** Distance between neighbours when a day is numbered from scratch, and the smallest gap worth keeping. */
export const POSITION_STEP = 1000;
export const MIN_GAP = 1e-6;

export const kindOf = (i: Pick<Item, "kind">): ItemKind => (i.kind === "commute" || i.kind === "buffer" ? i.kind : "stop");
export const isStop = (i: Pick<Item, "kind">) => kindOf(i) === "stop";
export const isConnector = (i: Pick<Item, "kind">) => !isStop(i);

/** The date shown for a trip day ("Day 1" is the start date). Null when the trip has no start date. */
export const dateForDay = (start: string | null | undefined, day: number | null): string | null =>
  start && day !== null && Number.isFinite(day) ? addDays(start, day - 1) : null;

/**
 * The day an item belongs to. The stored day number wins; an old item that only has a date (from before day numbers
 * were the source of truth) gets its day worked out from the trip start.
 */
export function dayOf(i: Pick<Item, "day" | "on_date">, start: string | null | undefined): number | null {
  if (i.day !== null && i.day !== undefined) return i.day;
  return i.on_date && start ? dayNumberFor(i.on_date, start) : null;
}

/** Saved position first; items that never got one fall back to time (untimed last), then creation order. */
export function byOrder(a: Item, b: Item): number {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  if ((pa === null) !== (pb === null)) return pa === null ? 1 : -1;
  return (a.at_time ?? "99").localeCompare(b.at_time ?? "99") || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export type DayGroup<T extends Item = Item> = { day: number | null; date: string | null; items: T[] };

/**
 * Every day of the trip in order, each with its items in order. Days with nothing in them are kept (when the trip's
 * length is known) so an item can be dragged onto an empty day. Items with no day go last as "Unscheduled".
 */
export function groupDays<T extends Item>(items: T[], start: string | null | undefined, tripDays: number | null): DayGroup<T>[] {
  const by = new Map<number | null, T[]>();
  for (const it of items) {
    const d = dayOf(it, start);
    by.set(d, [...(by.get(d) ?? []), it]);
  }
  const days = new Set<number>();
  if (tripDays) for (let d = 1; d <= tripDays; d++) days.add(d);
  for (const d of by.keys()) if (d !== null) days.add(d);
  const groups: DayGroup<T>[] = [...days]
    .sort((a, b) => a - b)
    .map((d) => ({ day: d, date: dateForDay(start, d), items: (by.get(d) ?? []).sort(byOrder) }));
  const loose = by.get(null);
  if (loose?.length) groups.push({ day: null, date: null, items: loose.sort(byOrder) });
  return groups;
}

/* ---------- order ---------- */

/** A position between two neighbours (either may be missing). */
export function positionBetween(prev: number | null | undefined, next: number | null | undefined): number {
  const p = prev ?? null;
  const n = next ?? null;
  if (p === null && n === null) return POSITION_STEP;
  if (p === null) return (n as number) - POSITION_STEP;
  if (n === null) return p + POSITION_STEP;
  return (p + n) / 2;
}

/** The gap has become too small to keep halving: the day should be numbered again. */
export const needsRespace = (prev: number | null | undefined, next: number | null | undefined) =>
  prev !== null && prev !== undefined && next !== null && next !== undefined && next - prev < MIN_GAP * 1000;

/** Positions for a position at the end of a day. */
export const endPosition = (dayItems: Item[]): number =>
  positionBetween(dayItems.reduce<number | null>((m, i) => (i.position === null || i.position === undefined ? m : m === null ? i.position : Math.max(m, i.position)), null), null);

/* ---------- connectors ---------- */

/**
 * Why a day's order is not allowed, or null. A connector cannot be the first or last thing in a day, and two of the
 * same kind cannot sit side by side (a commute next to a buffer is fine). `list` is the day in order.
 */
export function connectorProblem(list: Pick<Item, "kind">[]): string | null {
  const kinds = list.map(kindOf);
  if (kinds.length > 0 && kinds[0] !== "stop") return "A commute or break can’t be the first thing in a day.";
  if (kinds.length > 0 && kinds[kinds.length - 1] !== "stop") return "A commute or break can’t be the last thing in a day.";
  for (let i = 1; i < kinds.length; i++)
    if (kinds[i] !== "stop" && kinds[i] === kinds[i - 1])
      return kinds[i] === "commute" ? "Two commutes can’t sit side by side." : "Two breaks can’t sit side by side.";
  return null;
}

/** Can a connector of this kind be inserted at `index` (before list[index]) of a day? */
export function insertProblem(list: Item[], index: number, kind: "commute" | "buffer"): string | null {
  const next = [...list.slice(0, index), { kind } as Item, ...list.slice(index)];
  return connectorProblem(next);
}

/* ---------- moving ---------- */

export type Update = { id: string; day: number | null; position: number; on_date: string | null };
export type MoveResult = { ok: true; updates: Update[] } | { ok: false; reason: string };

/**
 * Move one item to `index` within `toDay` (index counts the items already there, without the moved one).
 * Usually one row changes: the moved item gets a position between its new neighbours. If those neighbours are too
 * close together, the whole day is numbered again. A move that breaks the connector rules is refused.
 */
export function planMove(
  all: Item[],
  id: string,
  toDay: number | null,
  index: number,
  start: string | null | undefined,
): MoveResult {
  const moved = all.find((i) => i.id === id);
  if (!moved) return { ok: false, reason: "That item is gone." };
  const target = groupDays(all.filter((i) => i.id !== id), start, null).find((g) => g.day === toDay)?.items ?? [];
  const at = Math.max(0, Math.min(index, target.length));
  const next = [...target.slice(0, at), moved, ...target.slice(at)];
  const problem = connectorProblem(next);
  if (problem) return { ok: false, reason: problem };

  const date = dateForDay(start, toDay);
  const prev = target[at - 1]?.position ?? null;
  const after = target[at]?.position ?? null;
  const unnumbered = target.some((i) => i.position === null || i.position === undefined);
  if (unnumbered || needsRespace(prev, after))
    return { ok: true, updates: next.map((i, n) => ({ id: i.id, day: toDay, position: (n + 1) * POSITION_STEP, on_date: date })) };
  return { ok: true, updates: [{ id, day: toDay, position: positionBetween(prev, after), on_date: date }] };
}

export type InsertPlan = { position: number; renumber: Update[] };

/**
 * Where a new item goes at `index` of a day (before dayItems[index]). If some items of the day have no position yet,
 * or the neighbours are too close, the day is numbered first and `renumber` says how.
 */
export function planInsert(dayItems: Item[], index: number, day: number | null, start: string | null | undefined): InsertPlan {
  const at = Math.max(0, Math.min(index, dayItems.length));
  const date = dateForDay(start, day);
  const prev = dayItems[at - 1]?.position ?? null;
  const next = dayItems[at]?.position ?? null;
  const unnumbered = dayItems.some((i) => i.position === null || i.position === undefined);
  if (!unnumbered && !needsRespace(prev, next)) return { position: positionBetween(prev, next), renumber: [] };
  const renumber = dayItems.map((i, n) => ({ id: i.id, day, position: (n + 1) * POSITION_STEP, on_date: date }));
  const p2 = at > 0 ? renumber[at - 1].position : null;
  const n2 = at < renumber.length ? renumber[at].position : null;
  return { position: positionBetween(p2, n2), renumber };
}

/* ---------- totals ---------- */

export type DayTotals = { activity: number; commute: number; buffer: number; total: number; long: boolean };

/** Minutes in a day. Tentative stops are placeholders for drafts, so they are not counted. */
export function dayTotals(items: Item[]): DayTotals {
  let activity = 0;
  let commute = 0;
  let buffer = 0;
  for (const i of items) {
    const m = i.duration_min ?? 0;
    const k = kindOf(i);
    if (k === "commute") commute += m;
    else if (k === "buffer") buffer += m;
    else if (!i.tentative) activity += m;
  }
  const total = activity + commute + buffer;
  return { activity, commute, buffer, total, long: total > LONG_DAY_MINUTES };
}

/** "6h 27m", or "" when there is nothing to add up. */
export const formatTotal = (minutes: number) => formatDuration(minutes);

/* ---------- connectors' own details ---------- */

export const COMMUTE_MODES = ["walk", "taxi", "bus", "train", "motorbike", "flight", "other"] as const;
export const COMMUTE_LABEL: Record<(typeof COMMUTE_MODES)[number], string> = {
  walk: "Walk",
  taxi: "Taxi / Grab",
  bus: "Bus",
  train: "Train",
  motorbike: "Motorbike",
  flight: "Flight",
  other: "Other",
};
export const BUFFER_KINDS = ["rest", "meal", "waiting", "check-in/out", "other"] as const;
export const BUFFER_LABEL: Record<(typeof BUFFER_KINDS)[number], string> = {
  rest: "Rest",
  meal: "Meal break",
  waiting: "Waiting",
  "check-in/out": "Check-in or check-out",
  other: "Other",
};
export const DURATION_PRESETS = [5, 10, 15, 30, 45, 60] as const;

export type ConnectorDetails = { mode?: string; bufferKind?: string; cost?: number; note?: string };

export function connectorDetails(raw: unknown): ConnectorDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  return {
    mode: typeof r.mode === "string" ? r.mode : undefined,
    bufferKind: typeof r.bufferKind === "string" ? r.bufferKind : undefined,
    cost: typeof r.cost === "number" && r.cost >= 0 ? r.cost : undefined,
    note: typeof r.note === "string" && r.note ? r.note.slice(0, 200) : undefined,
  };
}

/** The label a connector shows: "Taxi / Grab", "Rest", ... */
export function connectorLabel(i: Pick<Item, "kind" | "activity" | "details">): string {
  const d = connectorDetails(i.details);
  if (kindOf(i) === "commute") return COMMUTE_LABEL[d.mode as keyof typeof COMMUTE_LABEL] ?? (i.activity || "Commute");
  return BUFFER_LABEL[d.bufferKind as keyof typeof BUFFER_LABEL] ?? (i.activity || "Break");
}

/* ---------- stays on the timeline ---------- */

export type StayLike = { id: string; hotel: string; status: string; check_in: string | null; check_out: string | null; details?: unknown };
export type StayMark = { id: string; stayId: string; kind: "in" | "out"; hotel: string; day: number };

/**
 * A booked or planned stay appears by itself on its check-in and check-out days: no stored rows, so it can never go
 * out of step with the Stays page. Cancelled stays do not appear. Check-outs come first in a day, check-ins last.
 */
export function stayMarks(stays: StayLike[], start: string | null | undefined): StayMark[] {
  if (!start) return [];
  const out: StayMark[] = [];
  for (const s of stays) {
    if (s.status === "Cancelled") continue;
    if (s.check_in) out.push({ id: `in:${s.id}`, stayId: s.id, kind: "in", hotel: s.hotel, day: dayNumberFor(s.check_in, start) });
    if (s.check_out) out.push({ id: `out:${s.id}`, stayId: s.id, kind: "out", hotel: s.hotel, day: dayNumberFor(s.check_out, start) });
  }
  return out.filter((m) => m.day >= 1);
}

/* ---------- what a stop's detail rows say ---------- */

/** "08:00 · 1h", "08:00", "1h" or "Any time". */
export const timeLine = (i: Pick<Item, "at_time" | "duration_min">): string =>
  [formatTime(i.at_time), formatDuration(i.duration_min)].filter(Boolean).join(" · ") || "Any time";

/* ---------- directions ---------- */

/**
 * A Google Maps directions link through the stops, in the order given. It opens in the browser, so it costs no API call
 * and no quota. Two stops are the least a route needs.
 */
export function directionsUrl(stops: { lat: number; lng: number }[]): string | null {
  if (stops.length < 2) return null;
  return `https://www.google.com/maps/dir/${stops.map((s) => `${s.lat},${s.lng}`).join("/")}`;
}

/* ---------- links on a stop (website, Google Maps) ---------- */

export type StopLinks = { website?: string; mapsUrl?: string };
const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 500;

/** The website and Google Maps link saved on a stop. Anything that isn't a plain http(s) link reads as none. */
export function stopLinks(raw: unknown): StopLinks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  return { website: isHttp(r.website) ? r.website : undefined, mapsUrl: isHttp(r.mapsUrl) ? r.mapsUrl : undefined };
}

/** A stop's `details` with its links replaced (an empty link removes it). Other keys are kept as they were. */
export function withStopLinks(raw: unknown, links: { website: string | null; mapsUrl: string | null }): { [key: string]: Json } {
  const base: { [key: string]: Json } = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as { [key: string]: Json }) } : {};
  delete base.website;
  delete base.mapsUrl;
  if (links.website) base.website = links.website;
  if (links.mapsUrl) base.mapsUrl = links.mapsUrl;
  return base;
}
