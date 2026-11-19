import { describe, expect, it } from "vitest";
import type { Idea } from "./drafts";
import { blankStayForm, bookingForConfirm, formFromIdeaAsStay, formFromStay, stayIdeaColumns, withDayNumbers } from "./stay-sync";

const ID = "11111111-1111-4111-8111-111111111111";
const idea = (details: unknown = {}, over: Partial<Idea> = {}): Idea => ({
  table: "hotel_ideas",
  id: ID,
  key: `hotel_ideas:${ID}`,
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
  stay: null,
  ...over,
});
const booked = (details: unknown = {}) =>
  idea(details, { decision: "confirmed", stay: { checkIn: "2026-06-20", checkOut: "2026-06-23", status: "Booked", confirmation: "ABC123" } });

describe("stay sync (a stay is a booked hotel idea)", () => {
  it("an idea becomes a stay form: trip days turn into real dates from the trip start", () => {
    const f = formFromIdeaAsStay(idea({ checkInDay: 2, checkOutDay: 5, cancellation: "free", freeUntilDay: 1 }), "2026-06-16", "PHP");
    expect(f).toMatchObject({ name: "Old Quarter", checkIn: "2026-06-17", checkOut: "2026-06-20", freeUntil: "2026-06-16", stayStatus: "Planned", decision: "confirmed" });
  });

  it("a booked stay's own dates, booking and total come first", () => {
    const f = formFromStay(booked({ cancellation: "free", freeUntil: "2026-06-18" }), "PHP");
    expect(f).toMatchObject({ name: "Old Quarter", notes: "Near the lake", checkIn: "2026-06-20", checkOut: "2026-06-23", confirmation: "ABC123", stayStatus: "Booked", freeUntil: "2026-06-18", cost: "11400", unit: "total", decision: "confirmed" });
  });

  it("an unknown status reads as Planned", () => {
    const i = booked();
    i.stay!.status = "Weird";
    expect(formFromStay(i, "PHP").stayStatus).toBe("Planned");
  });

  it("a hand-entered stay starts confirmed and priced as a total", () => {
    expect(blankStayForm("PHP")).toMatchObject({ decision: "confirmed", unit: "total", name: "" });
  });

  it("real dates give the day numbers a place needs", () => {
    const out = withDayNumbers({ checkIn: "2026-06-20", checkOut: "2026-06-23", freeUntil: null, checkInDay: null, checkOutDay: null, freeUntilDay: null }, "2026-06-16");
    expect(out).toMatchObject({ checkInDay: 5, checkOutDay: 8, freeUntilDay: null });
    expect(withDayNumbers({ checkIn: "2026-06-20", checkOut: null, freeUntil: null, checkInDay: 2, checkOutDay: null, freeUntilDay: null }, null).checkInDay).toBe(2);
  });

  describe("stayIdeaColumns: the idea row for a saved stay form", () => {
    const out = { checkIn: "2026-06-20", checkOut: "2026-06-23", confirmation: "ABC123", stayStatus: "Booked" };
    const payload = { table: "hotel_ideas" as const, columns: { hotel: "Old Quarter", city: "Hanoi", room: "n", total: 11400, nights: 9, details: { rooms: "1 room", cancellation: "free" } }, insertOnly: {}, name: "Old Quarter", city: "Hanoi" };

    it("keeps the idea's columns and adds the booking", () => {
      expect(stayIdeaColumns(out, payload)).toMatchObject({ hotel: "Old Quarter", room: "n", total: 11400, decision: "confirmed", is_stay: true, check_in: "2026-06-20", check_out: "2026-06-23", confirmation: "ABC123", stay_status: "Booked" });
      expect(stayIdeaColumns(out, payload).details).toEqual({ rooms: "1 room", cancellation: "free" });
    });
    it("the real dates are the truth for the nights", () => {
      expect(stayIdeaColumns(out, payload).nights).toBe(3);
      expect(stayIdeaColumns({ ...out, checkOut: null }, payload).nights).toBe(9); // no end date: the idea's own count stays
    });
    it("a bad status is saved as Planned", () => {
      expect(stayIdeaColumns({ ...out, stayStatus: "nonsense" }, payload).stay_status).toBe("Planned");
    });
  });

  describe("bookingForConfirm: what confirming a hotel idea adds so it becomes a stay", () => {
    it("works out real dates and the free-until date from trip days and the trip start", () => {
      const b = bookingForConfirm(idea({ checkInDay: 2, checkOutDay: 5, cancellation: "free", freeUntilDay: 1 }), "2026-06-16")!;
      expect(b).toMatchObject({ is_stay: true, check_in: "2026-06-17", check_out: "2026-06-20", stay_status: "Planned" });
      expect(b.details).toMatchObject({ checkInDay: 2, cancellation: "free", freeUntil: "2026-06-16" });
    });
    it("leaves the details alone when the cancellation is not free", () => {
      const b = bookingForConfirm(idea({ checkInDay: 2, checkOutDay: 5, cancellation: "partial", freeUntilDay: 1 }), "2026-06-16")!;
      expect(b).not.toHaveProperty("details");
    });
    it("takes the price as the total when the idea has none", () => {
      expect(bookingForConfirm(idea({}, { total: null, price: 9000, priceUnit: "total" }), "2026-06-16")).toMatchObject({ total: 9000 });
      expect(bookingForConfirm(idea({}, { total: 5000 }), "2026-06-16")).not.toHaveProperty("total"); // never overwrites a total
    });
    it("has no dates without a trip start, and does nothing for a stay that already is one or for a place", () => {
      expect(bookingForConfirm(idea({ checkInDay: 2 }), null)).toMatchObject({ check_in: null, check_out: null });
      expect(bookingForConfirm(booked(), "2026-06-16")).toBeNull();
      expect(bookingForConfirm(idea({}, { kind: "food", table: "food_places" }), "2026-06-16")).toBeNull();
    });
  });
});
