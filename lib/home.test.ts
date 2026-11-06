import { describe, expect, it } from "vitest";
import { joinNames, nextUp } from "./home";

const base = { hasDates: true, stops: 3, travelers: 2, flights: 0, stays: 0, itineraryItems: 0, plannedCategories: 0 };

describe("Next up", () => {
  it("starts with the wizard's work done and the rest open", () => {
    const { items, allDone } = nextUp(base);
    expect(items.map((i) => [i.key, i.done])).toEqual([
      ["basics", true],
      ["flights", false],
      ["stays", false],
      ["day1", false],
      ["budgets", false],
    ]);
    expect(allDone).toBe(false);
  });
  it("ticks items off as the trip fills in and disappears when all are done", () => {
    const done = nextUp({ ...base, flights: 2, stays: 1, itineraryItems: 5, plannedCategories: 3 });
    expect(done.allDone).toBe(true);
  });
  it("counts the basics as open until dates, a stop and a traveler exist", () => {
    expect(nextUp({ ...base, hasDates: false }).items[0].done).toBe(false);
    expect(nextUp({ ...base, stops: 0 }).items[0].done).toBe(false);
    expect(nextUp({ ...base, travelers: 0 }).items[0].done).toBe(false);
  });
  it("links each item to the screen where it is done", () => {
    expect(nextUp(base).items.map((i) => i.href)).toEqual([
      "/settings",
      "/plan?tab=flights",
      "/plan?tab=stays",
      "/plan",
      "/spend",
    ]);
  });
});

describe("joinNames", () => {
  it("reads naturally", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Aq"])).toBe("Aq");
    expect(joinNames(["Aq", "Jam"])).toBe("Aq and Jam");
    expect(joinNames(["Aq", "Jam", "Ko"])).toBe("Aq, Jam and Ko");
  });
});
