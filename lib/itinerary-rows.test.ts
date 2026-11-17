import { describe, expect, it } from "vitest";
import type { Idea } from "./drafts";
import { stopRows } from "./itinerary-rows";

const idea = (over: Partial<Idea> = {}): Idea => ({
  table: "attractions",
  id: "a",
  key: "attractions:a",
  kind: "sight",
  name: "Trang An",
  city: "Ninh Binh",
  price: null,
  priceUnit: null,
  decision: "confirmed",
  note: null,
  nights: null,
  total: null,
  details: {},
  dealBreaker: false,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});
const at = { at_time: "07:30:00", duration_min: 180 };

describe("stopRows", () => {
  it("reads time, price, then the most important fact", () => {
    const rows = stopRows(at, idea({ price: 650, priceUnit: "person", details: { ticketsNeeded: true, duration: "2h" } }), "PHP");
    expect(rows).toEqual([
      { icon: "Clock", value: "7:30 AM · 3h", label: "Time" },
      { icon: "Coins", value: "PHP 650.00 per person", label: "Entrance" },
      { icon: "Ticket", value: "Book ahead", label: "Tickets", tone: "warn" },
    ]);
  });
  it("falls back to the note, then the area", () => {
    expect(stopRows({ ...at, note: "Bring a hat" }, undefined, "PHP").map((r) => r.label)).toEqual(["Time", "Note"]);
    expect(stopRows(at, idea({ city: "Hanoi" }), "PHP").map((r) => r.label)).toEqual(["Time", "Area"]);
  });
  it("never shows a link as a note, and never more than three rows", () => {
    expect(stopRows({ ...at, note: "https://example.com/x" }, undefined, "PHP")).toHaveLength(1);
    const rows = stopRows({ ...at, note: "n" }, idea({ price: 1, priceUnit: "person", details: { ticketsNeeded: true } }), "PHP");
    expect(rows).toHaveLength(3);
  });
  it("says Any time for an unscheduled place", () => {
    expect(stopRows({ at_time: null, duration_min: null }, undefined, "PHP")[0].value).toBe("Any time");
  });
});
