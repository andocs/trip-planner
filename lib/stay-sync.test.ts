import { describe, expect, it } from "vitest";
import type { Idea } from "./drafts";
import { formFromIdeaAsStay, formFromStay, stayColumns, stayOfIdea, withDayNumbers } from "./stay-sync";

const idea = (details: unknown = {}): Idea => ({
  table: "hotel_ideas",
  id: "11111111-1111-4111-8111-111111111111",
  key: "hotel_ideas:11111111-1111-4111-8111-111111111111",
  kind: "stay",
  name: "Old Quarter",
  city: "Hanoi",
  price: 3800,
  priceUnit: "night",
  decision: "draft",
  note: "Near the lake",
  nights: 3,
  total: 11400,
  details,
  dealBreaker: false,
  created_at: "2026-06-01T00:00:00Z",
});
const stay = (over: Record<string, unknown> = {}) =>
  ({ id: "s1", trip_id: "t", hotel: "Old Quarter", city: "Hanoi", room: null, note: null, check_in: "2026-06-20", check_out: "2026-06-23", total: 11400, confirmation: "ABC123", status: "Booked", created_at: "x", details: {}, ...over }) as never;

describe("stay sync", () => {
  it("an idea becomes a stay form: trip days turn into real dates from the trip start", () => {
    const f = formFromIdeaAsStay(idea({ checkInDay: 2, checkOutDay: 5, cancellation: "free", freeUntilDay: 1 }), "2026-06-16", "PHP");
    expect(f).toMatchObject({ name: "Old Quarter", checkIn: "2026-06-17", checkOut: "2026-06-20", freeUntil: "2026-06-16", stayStatus: "Planned", decision: "confirmed" });
  });
  it("a stay's own dates, booking and total come first", () => {
    const f = formFromStay(stay(), undefined, "PHP");
    expect(f).toMatchObject({ checkIn: "2026-06-20", checkOut: "2026-06-23", confirmation: "ABC123", stayStatus: "Booked", cost: "11400", unit: "total" });
  });
  it("real dates give the day numbers a place needs", () => {
    const out = withDayNumbers({ checkIn: "2026-06-20", checkOut: "2026-06-23", freeUntil: null, checkInDay: null, checkOutDay: null, freeUntilDay: null }, "2026-06-16");
    expect(out).toMatchObject({ checkInDay: 5, checkOutDay: 8, freeUntilDay: null });
    expect(withDayNumbers({ checkIn: "2026-06-20", checkOut: null, freeUntil: null, checkInDay: 2, checkOutDay: null, freeUntilDay: null }, null).checkInDay).toBe(2);
  });
  it("builds the stay row, linked to its idea", () => {
    const cols = stayColumns(
      { name: "Old Quarter", city: "Hanoi", notes: "n", rooms: "1 room", checkIn: "2026-06-20", checkOut: "2026-06-23", freeUntil: null, confirmation: "ABC123", stayStatus: "Booked", cancellation: "free", checkInTime: "14:00", breakfast: true, website: "https://example.com", mapsUrl: null },
      { table: "hotel_ideas", columns: { total: 11400 }, insertOnly: {}, name: "Old Quarter", city: "Hanoi" },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(cols).toMatchObject({ hotel: "Old Quarter", room: "1 room", total: 11400, status: "Booked", confirmation: "ABC123" });
    expect(cols.details).toMatchObject({ ideaId: "11111111-1111-4111-8111-111111111111", cancellation: "free", website: "https://example.com", breakfast: true });
  });
  it("finds the stay that came from an idea", () => {
    const s = stay({ details: { ideaId: "11111111-1111-4111-8111-111111111111" } });
    expect(stayOfIdea([s], "11111111-1111-4111-8111-111111111111")).toBe(s);
    expect(stayOfIdea([s], "other")).toBeUndefined();
  });
});
