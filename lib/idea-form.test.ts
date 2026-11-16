import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Idea } from "./drafts";
import { blankForm, FORM_SCHEMA, formFromIdea, toPayload } from "./idea-form";

type Kind = "stay" | "food" | "sight";
const valid = <K extends Kind>(kind: K, over: Record<string, unknown>) => {
  const r = FORM_SCHEMA[kind].safeParse({ ...blankForm(kind, "PHP"), ...over });
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data as z.output<(typeof FORM_SCHEMA)[K]>;
};

describe("validation", () => {
  it("needs a name and rejects a negative cost", () => {
    expect(FORM_SCHEMA.food.safeParse(blankForm("food", "PHP")).success).toBe(false);
    expect(FORM_SCHEMA.food.safeParse({ ...blankForm("food", "PHP"), name: "Pho", cost: "-5" }).success).toBe(false);
    expect(FORM_SCHEMA.food.safeParse({ ...blankForm("food", "PHP"), name: "Pho", cost: "" }).success).toBe(true);
  });
  it("allows an entrance fee of 0", () => {
    expect(valid("sight", { name: "Lake", cost: "0" }).cost).toBe(0);
  });
  it("rejects check-out before check-in", () => {
    const r = FORM_SCHEMA.stay.safeParse({ ...blankForm("stay", "PHP"), name: "Inn", checkInDay: "5", checkOutDay: "3" });
    expect(r.success).toBe(false);
  });
  it("rejects a bad time and an unknown chip", () => {
    expect(FORM_SCHEMA.stay.safeParse({ ...blankForm("stay", "PHP"), name: "Inn", checkInTime: "2pm" }).success).toBe(false);
    expect(FORM_SCHEMA.stay.safeParse({ ...blankForm("stay", "PHP"), name: "Inn", stayType: "castle" }).success).toBe(false);
  });
});

describe("toPayload: stay", () => {
  it("works out total and nights from the nightly price and the check-in / check-out days", () => {
    const p = toPayload("stay", valid("stay", { name: "Old Quarter", cost: "3800", unit: "night", checkInDay: "2", checkOutDay: "5", cancellation: "free", freeUntilDay: "1", breakfast: true, amenities: ["AC", "Wifi"] }));
    expect(p.table).toBe("hotel_ideas");
    expect(p.columns).toMatchObject({ hotel: "Old Quarter", nights: 3, total: 11400, decision: "draft", deal_breaker: false });
    expect(p.columns.details).toEqual({
      unit: "night",
      currency: "PHP",
      pricePerNight: 3800,
      checkInDay: 2,
      checkOutDay: 5,
      cancellation: "free",
      freeUntilDay: 1,
      breakfast: true,
      amenities: ["AC", "Wifi"],
    });
  });
  it("prefers typed nights over the day span, and keeps a flat total as the total", () => {
    const a = toPayload("stay", valid("stay", { name: "A", cost: "1000", unit: "night", nights: "2", checkInDay: "1", checkOutDay: "9" }));
    expect(a.columns).toMatchObject({ nights: 2, total: 2000 });
    const b = toPayload("stay", valid("stay", { name: "B", cost: "5000", unit: "total", nights: "2" }));
    expect(b.columns).toMatchObject({ nights: 2, total: 5000 });
    expect((b.columns.details as Record<string, unknown>).pricePerNight).toBeUndefined();
  });
  it("only keeps the free-until day when cancellation is free, and never stores a booking reference", () => {
    const p = toPayload("stay", valid("stay", { name: "C", cancellation: "partial", freeUntilDay: "3", booking: "booked" }));
    const d = p.columns.details as Record<string, unknown>;
    expect(d.freeUntilDay).toBeUndefined();
    expect(d.booking).toBe("booked");
    expect(Object.keys(d).some((k) => /ref|confirm|pnr/i.test(k))).toBe(false);
  });
});

describe("toPayload: food and sight", () => {
  it("writes the place columns and drops empty details", () => {
    const p = toPayload("food", valid("food", { name: "Bun cha", cost: "300", mealSlots: ["lunch"], queueProne: true, reservationNeeded: false, reservationBooked: true, dealBreaker: true }));
    expect(p.table).toBe("food_places");
    expect(p.columns).toMatchObject({ name: "Bun cha", price: 300, deal_breaker: true });
    expect(p.insertOnly).toEqual({ status: "Idea" });
    expect(p.columns.details).toEqual({ unit: "person", currency: "PHP", mealSlots: ["lunch"], queueProne: true });
  });
  it("keeps a custom duration over a preset and ignores 'booked' when no ticket is needed", () => {
    const p = toPayload("sight", valid("sight", { name: "Cave", duration: "2h", durationMin: "150", ticketsNeeded: false, ticketsBooked: true, effort: "strenuous" }));
    expect(p.columns.details).toEqual({ unit: "person", currency: "PHP", durationMin: 150, effort: "strenuous" });
  });
});

describe("formFromIdea", () => {
  const idea: Idea = {
    table: "hotel_ideas",
    id: "h1",
    key: "hotel_ideas:h1",
    kind: "stay",
    name: "Old Quarter",
    city: "Hanoi",
    price: 3800,
    priceUnit: "night",
    decision: "confirmed",
    note: "High floor",
    nights: 3,
    total: 11400,
    details: { unit: "night", pricePerNight: 3800, cancellation: "free", amenities: ["AC"], junk: 1 },
    dealBreaker: true,
    created_at: "2026-06-01T00:00:00Z",
  };
  it("fills the form from the columns and the details", () => {
    const f = formFromIdea(idea, "PHP");
    expect(f).toMatchObject({ name: "Old Quarter", city: "Hanoi", notes: "High floor", cost: "3800", unit: "night", nights: "3", cancellation: "free", amenities: ["AC"], dealBreaker: true, decision: "confirmed" });
  });
  it("round-trips: saving the unchanged form gives the same columns", () => {
    const p = toPayload("stay", valid("stay", formFromIdea(idea, "PHP")));
    expect(p.columns).toMatchObject({ hotel: "Old Quarter", city: "Hanoi", room: "High floor", nights: 3, total: 11400, deal_breaker: true, decision: "confirmed" });
  });
  it("treats damaged details as empty instead of failing", () => {
    const f = formFromIdea({ ...idea, details: "not an object" }, "PHP");
    expect(f.cancellation).toBe("");
    expect(f.cost).toBe("3800");
  });
});
