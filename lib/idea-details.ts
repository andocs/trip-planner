import { z } from "zod";
import type { Idea, IdeaKind } from "./drafts";
import { formatMoney } from "./format";

/**
 * Category-specific fields of an idea, stored in the `details` JSON column keyed by category
 * (stay | food | sight). One zod schema per category validates what the app saves and what it reads back;
 * unknown keys are dropped, and a value that no longer fits reads as "no details" instead of crashing.
 * Pure: no React, no network.
 *
 * Deliberately absent: a booking reference. Ideas are readable by viewers, and references stay owner-only.
 */

export const UNITS = ["night", "person", "total"] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_LABEL: Record<Unit, string> = { night: "per night", person: "per person", total: "total" };
export const DEFAULT_UNIT: Record<IdeaKind, Unit> = { stay: "night", food: "person", sight: "person" };
export const COST_LABEL: Record<IdeaKind, string> = {
  stay: "Price per night",
  food: "Price per person",
  sight: "Entrance fee per person",
};

export const STAY_TYPES = ["hotel", "hostel", "homestay", "apartment", "resort"] as const;
export const CANCELLATION = ["free", "partial", "non-refundable"] as const;
export const AMENITIES = ["AC", "Wifi", "Pool", "Laundry", "Luggage storage"] as const;
export const BOOKING = ["idea", "shortlisted", "booked"] as const;

export const CUISINES = ["Vietnamese", "Street food", "Seafood", "Cafe", "Other"] as const;
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "coffee", "drinks"] as const;
export const PRICE_BANDS = ["under 200", "200 to 500", "500 to 1,000", "over 1,000"] as const;
export const DIETARY = ["vegetarian options", "halal", "gluten-free", "vegan"] as const;
export const PAYMENT = ["cash only", "card ok"] as const;

export const SIGHT_TYPES = ["nature", "culture", "viewpoint", "activity", "market", "nightlife", "other"] as const;
export const DURATIONS = ["30m", "1h", "2h", "half day", "full day"] as const;
export const BEST_TIMES = ["sunrise", "morning", "afternoon", "sunset", "night"] as const;
export const EFFORT = ["easy", "moderate", "strenuous"] as const;
export const SETTING = ["indoor", "outdoor", "both"] as const;

const text = (n: number) => z.string().trim().min(1).max(n);
const day = z.number().int().min(-30).max(365);
/** A plain http(s) link, trimmed and short. Also used by the booked-stay record. */
export const link = z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/i);
/** What a stay has both as a board idea and as a booked record (lib/stay-details.ts), defined once. */
export const stayCommon = {
  cancellation: z.enum(CANCELLATION).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakfast: z.boolean().optional(),
};
const shared = {
  unit: z.enum(UNITS).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** The place's own website and its Google Maps link (a plain browser link, no API call). */
  website: link.optional(),
  mapsUrl: link.optional(),
};

export const stayDetails = z.object({
  ...shared,
  stayType: z.enum(STAY_TYPES).optional(),
  pricePerNight: z.number().min(0).optional(),
  checkInDay: day.optional(),
  checkOutDay: day.optional(),
  ...stayCommon,
  rooms: text(60).optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
  freeUntilDay: day.optional(),
  amenities: z.array(z.enum(AMENITIES)).max(10).optional(),
  nearby: text(120).optional(),
  booking: z.enum(BOOKING).optional(),
});

export const foodDetails = z.object({
  ...shared,
  cuisines: z.array(z.enum(CUISINES)).max(5).optional(),
  mustTry: text(120).optional(),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).max(6).optional(),
  priceBand: z.enum(PRICE_BANDS).optional(),
  dietary: z.array(z.enum(DIETARY)).max(4).optional(),
  hours: text(120).optional(),
  reservationNeeded: z.boolean().optional(),
  reservationBooked: z.boolean().optional(),
  queueProne: z.boolean().optional(),
  payment: z.enum(PAYMENT).optional(),
});

export const sightDetails = z.object({
  ...shared,
  sightType: z.enum(SIGHT_TYPES).optional(),
  ticketsNeeded: z.boolean().optional(),
  ticketsBooked: z.boolean().optional(),
  duration: z.enum(DURATIONS).optional(),
  durationMin: z.number().int().min(1).max(60 * 24).optional(),
  bestTimes: z.array(z.enum(BEST_TIMES)).max(5).optional(),
  hours: text(120).optional(),
  effort: z.enum(EFFORT).optional(),
  weatherSensitive: z.boolean().optional(),
  setting: z.enum(SETTING).optional(),
  bring: text(120).optional(),
});

export const DETAILS_SCHEMA = { stay: stayDetails, food: foodDetails, sight: sightDetails } as const;
export type StayDetails = z.infer<typeof stayDetails>;
export type FoodDetails = z.infer<typeof foodDetails>;
export type SightDetails = z.infer<typeof sightDetails>;
export type Details = StayDetails & FoodDetails & SightDetails;

/** Read a stored `details` value for a category. Anything that doesn't fit the schema reads as no details. */
export function parseDetails(kind: IdeaKind, raw: unknown): Details {
  const r = DETAILS_SCHEMA[kind].safeParse(raw ?? {});
  return r.success ? (r.data as Details) : {};
}

/** Drop empty strings, empty arrays and undefined so only what was actually filled in is stored. */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Minutes for a sight's duration chip or custom value (used for the day total later). */
export function durationMinutes(d: Pick<SightDetails, "duration" | "durationMin">): number | null {
  if (d.durationMin) return d.durationMin;
  switch (d.duration) {
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "2h":
      return 120;
    case "half day":
      return 240;
    case "full day":
      return 480;
    default:
      return null;
  }
}
export function durationLabel(d: Pick<SightDetails, "duration" | "durationMin">): string | null {
  if (d.durationMin) {
    const h = Math.floor(d.durationMin / 60);
    const m = d.durationMin % 60;
    return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
  }
  return d.duration ?? null;
}

/** Nights between two trip day numbers; null when either is missing or the order is wrong. */
export function nightsBetween(checkIn?: number, checkOut?: number): number | null {
  if (checkIn === undefined || checkOut === undefined || checkOut < checkIn) return null;
  return checkOut - checkIn;
}

/* ---------- what a card and the detail sheet show ---------- */

export type Chip = { key: string; label: string; icon: string; tone?: "ok" | "warn" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a: readonly string[] | undefined, max = 2) => (a ?? []).slice(0, max).map(cap).join(", ");

/**
 * The 2 or 3 most useful facts for a card, most important first: a booking that still needs doing, then price
 * and length, then the type. `icon` is a lucide icon name the card maps itself.
 */
export function cardChips(idea: Idea, currency: string): Chip[] {
  const d = parseDetails(idea.kind, idea.details);
  const chips: Chip[] = [];
  const money = (n: number) => formatMoney(n, d.currency ?? currency);

  if (idea.kind === "stay") {
    if (d.booking === "booked") chips.push({ key: "booking", label: "Booked", icon: "Check", tone: "ok" });
    else if (d.booking === "shortlisted") chips.push({ key: "booking", label: "Shortlisted", icon: "ListChecks" });
    if (d.cancellation === "free") chips.push({ key: "cancel", label: "Free cancellation", icon: "ShieldCheck", tone: "ok" });
    else if (d.cancellation === "non-refundable")
      chips.push({ key: "cancel", label: "Non-refundable", icon: "ShieldAlert", tone: "warn" });
    else if (d.cancellation === "partial") chips.push({ key: "cancel", label: "Partial refund", icon: "ShieldCheck" });
    if (idea.nights && idea.total !== null)
      chips.push({ key: "nights", label: `${idea.nights} ${idea.nights === 1 ? "night" : "nights"} · ${money(idea.total)}`, icon: "Moon" });
    if (d.stayType) chips.push({ key: "type", label: cap(d.stayType), icon: "BedDouble" });
  } else if (idea.kind === "food") {
    if (d.reservationNeeded && !d.reservationBooked)
      chips.push({ key: "reserve", label: "Reservation needed", icon: "CalendarClock", tone: "warn" });
    else if (d.reservationNeeded && d.reservationBooked)
      chips.push({ key: "reserve", label: "Reserved", icon: "Check", tone: "ok" });
    if (d.mealSlots?.length) chips.push({ key: "meal", label: list(d.mealSlots), icon: "Utensils" });
    if (d.queueProne) chips.push({ key: "queue", label: "Queue-prone", icon: "Clock", tone: "warn" });
    if (d.priceBand && idea.price === null) chips.push({ key: "band", label: `${d.priceBand} pp`, icon: "Coins" });
    if (d.payment === "cash only") chips.push({ key: "pay", label: "Cash only", icon: "Banknote" });
  } else {
    if (d.ticketsNeeded && !d.ticketsBooked) chips.push({ key: "tickets", label: "Book ahead", icon: "Ticket", tone: "warn" });
    else if (d.ticketsNeeded && d.ticketsBooked) chips.push({ key: "tickets", label: "Tickets booked", icon: "Check", tone: "ok" });
    const dur = durationLabel(d);
    if (dur) chips.push({ key: "duration", label: cap(dur), icon: "Timer" });
    if (d.sightType) chips.push({ key: "type", label: cap(d.sightType), icon: "Landmark" });
    if (d.effort && d.effort !== "easy") chips.push({ key: "effort", label: cap(d.effort), icon: "Footprints", tone: d.effort === "strenuous" ? "warn" : undefined });
    if (d.weatherSensitive) chips.push({ key: "weather", label: "Weather-sensitive", icon: "CloudRain" });
  }
  return chips.slice(0, 3);
}

/** Every filled-in field as label / value rows, for the read-only details on the idea sheet (viewers see these too). */
export function detailRows(idea: Idea): { label: string; value: string }[] {
  const d = parseDetails(idea.kind, idea.details);
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => value && rows.push({ label, value });
  const yn = (b: boolean | undefined) => (b === undefined ? null : b ? "Yes" : "No");
  const dayLabel = (n?: number) => (n === undefined ? null : `Day ${n}`);

  if (idea.kind === "stay") {
    add("Type", d.stayType && cap(d.stayType));
    add("Check-in", [dayLabel(d.checkInDay), d.checkInTime].filter(Boolean).join(" · ") || null);
    add("Check-out", dayLabel(d.checkOutDay));
    add("Rooms", d.rooms);
    add("Max guests", d.maxGuests?.toString());
    add("Cancellation", d.cancellation && cap(d.cancellation) + (d.freeUntilDay !== undefined ? `, free until Day ${d.freeUntilDay}` : ""));
    add("Breakfast", d.breakfast ? "Included" : null);
    add("Amenities", d.amenities?.join(", "));
    add("Nearby", d.nearby);
    add("Booking", d.booking && cap(d.booking));
  } else if (idea.kind === "food") {
    add("Cuisine", d.cuisines?.join(", "));
    add("Must-try", d.mustTry);
    add("Meal", list(d.mealSlots, 6));
    add("Price band", d.priceBand && `${d.priceBand} per person`);
    add("Dietary", list(d.dietary, 4));
    add("Hours", d.hours);
    add("Reservation", d.reservationNeeded ? (d.reservationBooked ? "Needed, booked" : "Needed, not booked yet") : null);
    add("Queue", d.queueProne ? "Often a queue" : null);
    add("Payment", d.payment && cap(d.payment));
  } else {
    add("Type", d.sightType && cap(d.sightType));
    add("Tickets", d.ticketsNeeded ? (d.ticketsBooked ? "Needed in advance, booked" : "Needed in advance, not booked yet") : null);
    add("Duration", durationLabel(d));
    add("Best time", list(d.bestTimes, 5));
    add("Hours", d.hours);
    add("Effort", d.effort && cap(d.effort));
    add("Weather", yn(d.weatherSensitive) === "Yes" ? "Weather-sensitive" : null);
    add("Setting", d.setting && cap(d.setting));
    add("Bring", d.bring);
  }
  return rows;
}
