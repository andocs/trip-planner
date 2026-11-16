import { describe, expect, it } from "vitest";
import type { Idea } from "./drafts";
import { cardChips, compact, detailRows, durationLabel, durationMinutes, nightsBetween, parseDetails } from "./idea-details";

const idea = (over: Partial<Idea>): Idea => ({
  table: "attractions",
  id: "a",
  key: "attractions:a",
  kind: "sight",
  name: "X",
  city: null,
  price: null,
  priceUnit: null,
  decision: "draft",
  note: null,
  nights: null,
  total: null,
  details: {},
  dealBreaker: false,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("parseDetails", () => {
  it("keeps known fields, drops unknown ones and reads damage as empty", () => {
    expect(parseDetails("sight", { effort: "easy", junk: 1 })).toEqual({ effort: "easy" });
    expect(parseDetails("sight", { effort: "ridiculous" })).toEqual({});
    expect(parseDetails("food", "nope")).toEqual({});
    expect(parseDetails("stay", null)).toEqual({});
  });
});

describe("helpers", () => {
  it("compact drops blanks but keeps false and 0", () => {
    expect(compact({ a: "", b: [], c: undefined, d: null, e: false, f: 0, g: "x" })).toEqual({ e: false, f: 0, g: "x" });
  });
  it("nights between trip days", () => {
    expect(nightsBetween(2, 5)).toBe(3);
    expect(nightsBetween(5, 2)).toBeNull();
    expect(nightsBetween(undefined, 2)).toBeNull();
  });
  it("durations", () => {
    expect(durationMinutes({ duration: "half day" })).toBe(240);
    expect(durationMinutes({ duration: "1h", durationMin: 90 })).toBe(90);
    expect(durationMinutes({})).toBeNull();
    expect(durationLabel({ durationMin: 150 })).toBe("2 h 30 min");
    expect(durationLabel({ duration: "2h" })).toBe("2h");
  });
});

describe("cardChips", () => {
  it("shows at most three, with what still needs doing first", () => {
    const chips = cardChips(idea({ details: { ticketsNeeded: true, duration: "2h", sightType: "nature", effort: "strenuous" } }), "PHP");
    expect(chips.map((c) => c.key)).toEqual(["tickets", "duration", "type"]);
    expect(chips[0]).toMatchObject({ label: "Book ahead", tone: "warn" });
  });
  it("shows booked tickets as done", () => {
    expect(cardChips(idea({ details: { ticketsNeeded: true, ticketsBooked: true } }), "PHP")[0]).toMatchObject({ label: "Tickets booked", tone: "ok" });
  });
  it("stays: booking, cancellation, nights and total", () => {
    const chips = cardChips(idea({ kind: "stay", table: "hotel_ideas", nights: 3, total: 11400, details: { booking: "booked", cancellation: "free", stayType: "hotel" } }), "PHP");
    expect(chips.map((c) => c.label)).toEqual(["Booked", "Free cancellation", "3 nights · PHP 11,400.00"]);
  });
  it("food: reservation first, then the meal and the queue", () => {
    const chips = cardChips(idea({ kind: "food", table: "food_places", details: { reservationNeeded: true, mealSlots: ["lunch", "dinner"], queueProne: true } }), "PHP");
    expect(chips.map((c) => c.label)).toEqual(["Reservation needed", "Lunch, Dinner", "Queue-prone"]);
  });
  it("is empty when nothing was filled in", () => {
    expect(cardChips(idea({}), "PHP")).toEqual([]);
  });
});

describe("detailRows", () => {
  it("lists only what was filled in", () => {
    const rows = detailRows(idea({ details: { sightType: "nature", ticketsNeeded: true, bestTimes: ["morning", "sunset"] } }));
    expect(rows).toEqual([
      { label: "Type", value: "Nature" },
      { label: "Tickets", value: "Needed in advance, not booked yet" },
      { label: "Best time", value: "Morning, Sunset" },
    ]);
  });
});
