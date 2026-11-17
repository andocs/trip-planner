import { z } from "zod";
import { daysBetween } from "./calc";
import { formatDay } from "./format";
import { CANCELLATION, compact } from "./idea-details";

/**
 * Extra facts about a booked stay, kept in `stays.details` (a small JSON object, like the idea details).
 * Dates here are real calendar dates because a stay is a real booking; the trip's day numbers only appear on ideas.
 * Pure: no React, no network. `today` is passed in so server and browser render the same words.
 */
export const stayRecordDetails = z.object({
  cancellation: z.enum(CANCELLATION).optional(),
  /** Last day the booking can be cancelled for free (YYYY-MM-DD). */
  freeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakfast: z.boolean().optional(),
  /** The stay's own website and its Google Maps link (plain browser links). */
  website: z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/i).optional(),
  mapsUrl: z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/i).optional(),
});
export type StayRecordDetails = z.infer<typeof stayRecordDetails>;

export function parseStayDetails(raw: unknown): StayRecordDetails {
  const r = stayRecordDetails.safeParse(raw ?? {});
  return r.success ? r.data : {};
}

/** What to store: only what was filled in, and a free-until date only when the cancellation is free. */
export function buildStayDetails(v: {
  cancellation: string;
  freeUntil: string | null;
  checkInTime: string;
  breakfast: boolean;
  website?: string | null;
  mapsUrl?: string | null;
}): StayRecordDetails {
  return stayRecordDetails.parse(
    compact({
      cancellation: v.cancellation || undefined,
      freeUntil: v.cancellation === "free" ? v.freeUntil : undefined,
      checkInTime: v.checkInTime || undefined,
      breakfast: v.breakfast ? true : undefined,
      website: v.website ?? undefined,
      mapsUrl: v.mapsUrl ?? undefined,
    }),
  );
}

export type Fact = { label: string; tone?: "ok" | "warn" };

/** "Check-in tomorrow", "Staying now", ... Null when it is far off, unknown, or `today` is not known yet. */
export function checkInFact(checkIn: string | null, checkOut: string | null, today: string | null): Fact | null {
  if (!checkIn || !today) return null;
  const d = daysBetween(today, checkIn);
  if (d < 0) {
    if (checkOut && daysBetween(today, checkOut) >= 0) return { label: "Staying now", tone: "ok" };
    return null;
  }
  if (d === 0) return { label: "Check-in today", tone: "ok" };
  if (d === 1) return { label: "Check-in tomorrow", tone: "ok" };
  if (d <= 14) return { label: `Check-in in ${d} days` };
  return null;
}

/** The cancellation terms in words, with the free-until date and whether it has already passed. */
export function cancellationFact(d: StayRecordDetails, today: string | null): Fact | null {
  if (d.cancellation === "free") {
    if (!d.freeUntil) return { label: "Free cancellation", tone: "ok" };
    if (today && daysBetween(today, d.freeUntil) < 0) return { label: "Free cancellation ended", tone: "warn" };
    return { label: `Free cancellation until ${formatDay(d.freeUntil, "d MMM")}`, tone: "ok" };
  }
  if (d.cancellation === "partial") return { label: "Partial refund" };
  if (d.cancellation === "non-refundable") return { label: "Non-refundable", tone: "warn" };
  return null;
}

/** A booking counts as booked when its status says so; anything earlier still needs doing. */
export const isBooked = (status: string) => status === "Booked" || status === "Done";
