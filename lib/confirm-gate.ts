import type { Idea } from "./drafts";
import { parseDetails } from "./idea-details";

/**
 * Checks before a place is confirmed. A confirmed place counts toward the budget and the exports, and a confirmed stay is
 * also added to the Stays page, so a few things are worth settling first.
 *  - blockers: the confirmation cannot be done without them (a stay needs dates to be a booking).
 *  - warnings: worth a look, but confirming anyway is fine.
 * Pure: the votes and the trip start come in as plain numbers.
 */
export type Gate = { blockers: string[]; warnings: string[] };

export function confirmGate(idea: Idea, ctx: { tripStart: string | null | undefined; votes?: { in: number; maybe: number; pass: number } }): Gate {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const d = parseDetails(idea.kind, idea.details);

  if (idea.kind === "stay") {
    if (!ctx.tripStart) blockers.push("Set the trip’s start date in Settings, so the stay’s dates can be worked out.");
    if (d.checkInDay === undefined) blockers.push("Add a check-in day.");
    if (d.checkOutDay === undefined) blockers.push("Add a check-out day.");
    else if (d.checkInDay !== undefined && d.checkOutDay < d.checkInDay) blockers.push("Check-out is before check-in.");
  }

  if (idea.price === null && idea.total === null) warnings.push("No price yet, so it won’t count toward the budget.");
  if (!idea.city) warnings.push("No area set.");
  if (idea.kind === "sight" && d.ticketsNeeded && !d.ticketsBooked) warnings.push("Tickets are needed and not booked yet.");
  if (idea.kind === "food" && d.reservationNeeded && !d.reservationBooked) warnings.push("A reservation is needed and not made yet.");
  if (idea.kind === "stay" && d.cancellation === undefined) warnings.push("No cancellation terms noted.");
  if (ctx.votes) {
    const total = ctx.votes.in + ctx.votes.maybe + ctx.votes.pass;
    if (total === 0) warnings.push("Nobody has voted on it yet.");
    else if (ctx.votes.in === 0) warnings.push("Nobody voted “I’m in”.");
    else if (ctx.votes.pass > ctx.votes.in) warnings.push("More people passed than are in.");
  }
  return { blockers, warnings };
}

/** A confirmation needs a question first when anything is flagged, and always for a stay (it goes to the Stays page too). */
export const needsConfirmation = (idea: Idea, gate: Gate): boolean => idea.kind === "stay" || gate.blockers.length > 0 || gate.warnings.length > 0;
