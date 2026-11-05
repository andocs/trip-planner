import { describe, expect, it } from "vitest";
import seed from "../seed/vietnam26.seed.json";
import { buildSeedPlan } from "./seed-map";

let n = 0;
const uuid = () => `id-${n++}`;
const defaults = [
  "Flights",
  "Accommodation",
  "Food & Drinks",
  "Transport",
  "Activities & Tickets",
  "Shopping & Pasalubong",
  "SIM & Misc",
  "Other",
].map((name, i) => ({ id: `cat-${i}`, name }));

describe("Vietnam '26 seed mapping", () => {
  const plan = buildSeedPlan(seed, defaults, uuid);

  it("maps trip settings", () => {
    expect(plan.trip).toMatchObject({
      name: "Vietnam '26",
      start_date: "2026-06-16",
      end_date: "2026-06-26",
      home_currency: "PHP",
      foreign_currency: "VND",
      rate: 0.002457,
      budget: 118165,
      map_region: "VN",
    });
  });

  it("produces the expected row counts", () => {
    const counts = Object.fromEntries(Object.entries(plan.rows).map(([k, v]) => [k, v.length]));
    expect(counts).toEqual({
      travelers: 2,
      destinations: 3,
      categories: 0, // all 7 seed categories already exist as defaults
      expenses: 5,
      itinerary_items: 140,
      flights: 2,
      transfers: 6,
      stays: 5,
      hotel_ideas: 14,
      food_places: 19,
      menu_items: 44,
      attractions: 36,
      packing_items: 40,
      gifts: 5,
      reminders: 6,
    });
  });

  it("reuses default categories and sets planned amounts", () => {
    expect(plan.categoryUpdates).toHaveLength(7);
    expect(plan.categoryUpdates.find((c) => c.id === "cat-0")?.planned).toBe(27975.78);
    expect(plan.categoryUpdates.find((c) => c.id === "cat-2")?.planned).toBeNull(); // Food & Drinks: no plan
  });

  it("links expenses to travelers and categories", () => {
    const jam = plan.rows.travelers.find((t) => t.name === "Jam")!;
    expect(plan.rows.expenses.every((e) => e.paid_by === jam.id)).toBe(true);
    expect(plan.rows.expenses[0].category_id).toBe("cat-3"); // Transport
  });

  it("dates undated expenses on the trip start and says so", () => {
    const undated = plan.rows.expenses.filter((e) => e.note?.includes("Date not recorded"));
    expect(undated).toHaveLength(2);
    expect(undated.every((e) => e.spent_on === "2026-06-16")).toBe(true);
    expect(plan.notes.join(" ")).toMatch(/2 expense/);
  });

  it("turns empty strings into nulls and keeps local flight times", () => {
    expect(plan.rows.flights[0]).toMatchObject({ booking_ref: null, departs_at: "2026-06-16T22:20", status: "Priced" });
    expect(plan.rows.menu_items[0].price_foreign).toBe(80000);
  });
});
