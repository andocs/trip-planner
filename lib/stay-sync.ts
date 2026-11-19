import { daysBetween, dayNumberFor } from "./calc";
import type { Idea } from "./drafts";
import { blankForm, formFromIdea, type IdeaFormValues, type IdeaPayload } from "./idea-form";
import { parseDetails } from "./idea-details";
import { dateForDay } from "./itinerary";
import { str } from "./schemas";
import { STAY_STATUSES, validStatus } from "./stays";

export { STAY_STATUSES };

/**
 * A stay is a hotel idea that has been booked (migration 31): the SAME row, with real dates and the booking on it. A board
 * idea thinks in trip day numbers; a booked stay in real dates. The Stays page edits a stay in the SAME form as a place, so
 * these helpers translate between the form and the idea's columns. Pure: no React, no network.
 */

const dayToDate = (start: string | null | undefined, day: number | undefined) => (day === undefined ? "" : (dateForDay(start, day) ?? ""));

/** The form for a stay that already exists: the idea's own fields, then its booking (dates, status, confirmation). */
export function formFromStay(idea: Idea, currency: string): IdeaFormValues {
  const f = formFromIdea(idea, currency);
  const d = parseDetails("stay", idea.details);
  f.checkIn = idea.stay?.checkIn ?? "";
  f.checkOut = idea.stay?.checkOut ?? "";
  f.confirmation = idea.stay?.confirmation ?? "";
  f.stayStatus = validStatus(idea.stay?.status);
  f.freeUntil = d.freeUntil ?? "";
  // What was booked is shown as a plain total.
  f.cost = str(idea.total);
  f.unit = "total";
  f.decision = "confirmed";
  return f;
}

/** The form for booking an existing board idea as a stay: its trip days become real dates from the trip start. */
export function formFromIdeaAsStay(idea: Idea, start: string | null | undefined, currency: string): IdeaFormValues {
  const f = formFromIdea(idea, currency);
  const d = parseDetails("stay", idea.details);
  f.checkIn = dayToDate(start, d.checkInDay);
  f.checkOut = dayToDate(start, d.checkOutDay);
  f.freeUntil = dayToDate(start, d.freeUntilDay);
  f.stayStatus = "Planned";
  f.decision = "confirmed";
  return f;
}

/** A blank form for a stay entered by hand: confirmed, priced as a total. */
export const blankStayForm = (currency: string): IdeaFormValues => ({ ...blankForm("stay", currency), decision: "confirmed", unit: "total" });

/** Before the form is turned into an idea payload: the real dates give the trip day numbers (and so the nights). */
export function withDayNumbers<T extends { checkIn: string | null; checkOut: string | null; freeUntil: string | null; checkInDay: number | null; checkOutDay: number | null; freeUntilDay: number | null }>(
  out: T,
  start: string | null | undefined,
): T {
  if (!start) return out;
  const day = (date: string | null) => (date ? dayNumberFor(date, start) : null);
  return {
    ...out,
    checkInDay: day(out.checkIn) ?? out.checkInDay,
    checkOutDay: day(out.checkOut) ?? out.checkOutDay,
    freeUntilDay: day(out.freeUntil) ?? out.freeUntilDay,
  };
}

type StayOut = { checkIn: string | null; checkOut: string | null; confirmation: string | null; stayStatus: string };

/**
 * The hotel idea's columns for a saved stay form: the idea's own columns (name, city, notes, total, details) plus the booking.
 * The real dates are the truth for the nights. `payload.columns.total` already holds nights times price.
 */
export function stayIdeaColumns(out: StayOut, payload: IdeaPayload): Record<string, unknown> {
  const nights = out.checkIn && out.checkOut ? daysBetween(out.checkIn, out.checkOut) : (payload.columns.nights ?? null);
  return {
    ...payload.columns,
    nights,
    decision: "confirmed",
    is_stay: true,
    check_in: out.checkIn,
    check_out: out.checkOut,
    confirmation: out.confirmation,
    stay_status: validStatus(out.stayStatus),
  };
}

/**
 * What confirming a hotel idea adds to it so it becomes a stay: real dates from its trip days and the trip start, a free-until
 * date when the cancellation is free, and its price as a total. Null when it already is a stay.
 */
export function bookingForConfirm(idea: Idea, start: string | null | undefined): Record<string, unknown> | null {
  if (idea.kind !== "stay" || idea.stay) return null;
  const d = parseDetails("stay", idea.details);
  const freeUntil = d.cancellation === "free" ? dateForDay(start, d.freeUntilDay ?? null) : null;
  const total = idea.total ?? (idea.priceUnit === "total" ? idea.price : null);
  const checkIn = dateForDay(start, d.checkInDay ?? null);
  const checkOut = dateForDay(start, d.checkOutDay ?? null);
  return {
    is_stay: true,
    check_in: checkIn,
    check_out: checkOut,
    stay_status: "Planned",
    ...(total !== null && idea.total === null ? { total } : {}),
    ...(freeUntil ? { details: { ...(idea.details as Record<string, unknown>), freeUntil } } : {}),
  };
}
