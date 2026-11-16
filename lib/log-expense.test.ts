import { describe, expect, it } from "vitest";
import { effectivePlanned, inPlan, plannedTotal } from "./calc";
import { categoryFor, expenseDefaults, flightDescription, sourceKey, stayDescription } from "./log-expense";

describe("the planned budget", () => {
  it("counts flights and stays that are in the plan, not ideas or cancelled ones", () => {
    for (const s of ["Planned", "Priced", "Booked", "Done"]) expect(inPlan(s), s).toBe(true);
    for (const s of ["Idea", "Maybe", "Cancelled", ""]) expect(inPlan(s), s).toBe(false);
  });
  it("adds up what is in the plan and treats a missing price as zero", () => {
    const rows = [
      { status: "Booked", fare: 1000 },
      { status: "Priced", fare: "2500.50" },
      { status: "Idea", fare: 9999 },
      { status: "Cancelled", fare: 500 },
      { status: "Planned", fare: null },
    ];
    expect(plannedTotal(rows, (r) => r.fare)).toBe(3500.5);
    expect(plannedTotal([], () => 1)).toBe(0);
  });
  it("is the larger of the allocation and what the items add up to", () => {
    expect(effectivePlanned(25000, 12000)).toBe(25000); // an allocation is a floor the items fit inside
    expect(effectivePlanned(25000, 30000)).toBe(30000); // the plan grows past it
    expect(effectivePlanned(null, 12000)).toBe(12000); // no allocation: the items stand in for it
    expect(effectivePlanned(0, 0)).toBe(0); // an explicit zero stays a zero
  });
  it("leaves a category with nothing planned as 'not planned'", () => {
    expect(effectivePlanned(null, 0)).toBeNull();
  });
});

describe("Log as expense", () => {
  const cats = [
    { id: "c1", name: "Flights" },
    { id: "c2", name: " Accommodation " },
    { id: "c3", name: "Food & Drinks" },
  ];
  it("finds the category by its default name, ignoring case and spaces", () => {
    expect(categoryFor("flights", cats)).toBe("c1");
    expect(categoryFor("stays", cats)).toBe("c2");
    expect(categoryFor("flights", [{ id: "x", name: "Plane tickets" }])).toBeNull();
  });
  it("describes a flight and a stay the way a person would", () => {
    expect(flightDescription({ from_code: "MNL", to_code: "HAN", airline: "Cebu Pacific", flight_no: "5J 123" })).toBe(
      "Flight MNL → HAN (Cebu Pacific 5J 123)",
    );
    expect(flightDescription({ from_code: "MNL", to_code: null, airline: null, flight_no: null })).toBe(
      "Flight MNL → ?",
    );
    expect(stayDescription({ hotel: "Old Quarter Hotel", city: "Hanoi" })).toBe("Stay: Old Quarter Hotel · Hanoi");
    expect(stayDescription({ hotel: "Homestay", city: null })).toBe("Stay: Homestay");
  });
  it("starts the form with the fare or total, the right category and today's date", () => {
    const f = expenseDefaults(
      "flights",
      { from_code: "MNL", to_code: "HAN", airline: null, flight_no: null, fare: 12000 },
      cats,
      "2026-06-10",
    );
    expect(f).toEqual({ description: "Flight MNL → HAN", amount: "12000", category_id: "c1", spent_on: "2026-06-10" });
    const s = expenseDefaults("stays", { hotel: "H", city: null, total: null }, cats, "2026-06-10");
    expect(s.amount).toBe("");
    expect(s.category_id).toBe("c2");
  });
  it("keys an expense to its source", () => {
    expect(sourceKey("flights", "abc")).toBe("flights:abc");
  });
});
