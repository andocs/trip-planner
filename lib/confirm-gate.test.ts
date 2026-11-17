import { describe, expect, it } from "vitest";
import { confirmGate, needsConfirmation } from "./confirm-gate";
import type { Idea } from "./drafts";

const idea = (over: Partial<Idea> = {}): Idea => ({
  table: "attractions",
  id: "a",
  key: "attractions:a",
  kind: "sight",
  name: "Castle",
  city: "Osaka",
  price: 480,
  priceUnit: "person",
  decision: "draft",
  note: null,
  nights: null,
  total: null,
  details: {},
  dealBreaker: false,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});
const ctx = { tripStart: "2026-06-16", votes: { in: 2, maybe: 0, pass: 0 } };

describe("confirmGate", () => {
  it("has nothing to say about a complete, liked place", () => {
    const g = confirmGate(idea(), ctx);
    expect(g).toEqual({ blockers: [], warnings: [] });
    expect(needsConfirmation(idea(), g)).toBe(false);
  });
  it("warns about a missing price and area, but does not block", () => {
    const g = confirmGate(idea({ price: null, city: null }), ctx);
    expect(g.blockers).toEqual([]);
    expect(g.warnings).toHaveLength(2);
    expect(needsConfirmation(idea({ price: null }), g)).toBe(true);
  });
  it("warns about votes", () => {
    expect(confirmGate(idea(), { ...ctx, votes: { in: 0, maybe: 0, pass: 0 } }).warnings).toContain("Nobody has voted on it yet.");
    expect(confirmGate(idea(), { ...ctx, votes: { in: 0, maybe: 1, pass: 0 } }).warnings).toContain("Nobody voted “I’m in”.");
    expect(confirmGate(idea(), { ...ctx, votes: { in: 1, maybe: 0, pass: 2 } }).warnings).toContain("More people passed than are in.");
  });
  it("flags unbooked tickets and reservations", () => {
    expect(confirmGate(idea({ details: { sight: undefined, ticketsNeeded: true } }), ctx).warnings.join(" ")).toMatch(/Tickets/);
    expect(confirmGate(idea({ kind: "food", table: "food_places", details: { reservationNeeded: true } }), ctx).warnings.join(" ")).toMatch(/reservation/);
  });
  it("blocks a stay with no dates or no trip start, and always asks for a stay", () => {
    const stay = idea({ kind: "stay", table: "hotel_ideas", details: {} });
    const g = confirmGate(stay, ctx);
    expect(g.blockers).toEqual(["Add a check-in day.", "Add a check-out day."]);
    expect(confirmGate(stay, { ...ctx, tripStart: null }).blockers[0]).toMatch(/start date/);
    const ok = idea({ kind: "stay", table: "hotel_ideas", details: { checkInDay: 2, checkOutDay: 5, cancellation: "free" } });
    expect(confirmGate(ok, ctx).blockers).toEqual([]);
    expect(needsConfirmation(ok, confirmGate(ok, ctx))).toBe(true);
    expect(confirmGate(idea({ kind: "stay", table: "hotel_ideas", details: { checkInDay: 5, checkOutDay: 2 } }), ctx).blockers).toContain("Check-out is before check-in.");
  });
});
