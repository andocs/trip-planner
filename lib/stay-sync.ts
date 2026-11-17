import { dayNumberFor } from "./calc";
import type { Tables } from "./database.types";
import type { Idea } from "./drafts";
import { blankForm, formFromIdea, type IdeaFormValues, type IdeaPayload } from "./idea-form";
import { parseDetails } from "./idea-details";
import { dateForDay } from "./itinerary";
import { str } from "./schemas";
import { buildStayDetails, parseStayDetails } from "./stay-details";

/**
 * A stay is a booking (real dates, a confirmation number), a board idea is a plan (trip day numbers). The Stays page edits
 * a stay in the SAME form as a place, so these helpers translate between the two: record -> form, idea -> form, and form ->
 * the stay row. Every stay is linked to a hotel idea (details.ideaId) so the board and Stays stay one list. Pure.
 */

type Stay = Tables<"stays">;
export const STAY_STATUSES = ["Planned", "Booked", "Done", "Cancelled"] as const;

const dayToDate = (start: string | null | undefined, day: number | undefined) => (day === undefined ? "" : (dateForDay(start, day) ?? ""));

/** The form for a stay that already exists (its own dates and booking first, then what the linked idea knows). */
export function formFromStay(stay: Stay, idea: Idea | undefined, currency: string): IdeaFormValues {
  const f = idea ? formFromIdea(idea, currency) : blankForm("stay", currency);
  const d = parseStayDetails(stay.details);
  f.name = stay.hotel;
  f.city = stay.city ?? "";
  f.notes = stay.note ?? "";
  f.rooms = stay.room ?? f.rooms;
  f.checkIn = stay.check_in ?? "";
  f.checkOut = stay.check_out ?? "";
  f.confirmation = stay.confirmation ?? "";
  f.stayStatus = (STAY_STATUSES as readonly string[]).includes(stay.status) ? stay.status : "Planned";
  f.cancellation = d.cancellation ?? f.cancellation;
  f.freeUntil = d.freeUntil ?? "";
  f.checkInTime = d.checkInTime ?? f.checkInTime;
  f.breakfast = d.breakfast ?? f.breakfast;
  f.website = d.website ?? f.website;
  f.mapsUrl = d.mapsUrl ?? f.mapsUrl;
  // The stay's total is what was booked: it is shown as a plain total.
  f.cost = str(stay.total);
  f.unit = "total";
  f.decision = "confirmed";
  return f;
}

/** The form for confirming an existing board idea as a stay: its trip days become real dates from the trip start. */
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

type StayOut = {
  name: string;
  city: string | null;
  notes: string | null;
  rooms?: string | null;
  checkIn: string | null;
  checkOut: string | null;
  freeUntil: string | null;
  confirmation: string | null;
  stayStatus: string;
  cancellation: string;
  checkInTime: string;
  breakfast: boolean;
  website: string | null;
  mapsUrl: string | null;
};

/** The columns of the stay row for a saved form. `payload.columns.total` already holds nights times price. */
export function stayColumns(out: StayOut, payload: IdeaPayload, ideaId: string | null) {
  const total = payload.columns.total;
  return {
    hotel: out.name,
    city: out.city,
    room: out.rooms ?? null,
    note: out.notes,
    check_in: out.checkIn,
    check_out: out.checkOut,
    total: typeof total === "number" ? total : null,
    confirmation: out.confirmation,
    status: (STAY_STATUSES as readonly string[]).includes(out.stayStatus) ? out.stayStatus : "Planned",
    details: buildStayDetails({
      cancellation: out.cancellation,
      freeUntil: out.freeUntil,
      checkInTime: out.checkInTime,
      breakfast: out.breakfast,
      website: out.website,
      mapsUrl: out.mapsUrl,
      ideaId,
    }),
  };
}

/** The stay row that came from this board idea, if there is one. */
export function stayOfIdea(stays: Stay[], ideaId: string): Stay | undefined {
  return stays.find((s) => parseStayDetails(s.details).ideaId === ideaId);
}
