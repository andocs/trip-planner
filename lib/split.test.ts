import { describe, expect, it } from "vitest";
import { expenseShares, itemsOf, parseSplit, specToStore, splitProblem, type SplitSpec } from "./split";

const all = ["a", "b", "c"];
const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((x, y) => x + y, 0) * 100) / 100;

describe("expenseShares", () => {
  it("splits equally between everyone when there is no spec, and the cents add up", () => {
    const m = expenseShares(100, null, all);
    expect(sum(m)).toBe(100);
    expect([...m.values()].sort()).toEqual([33.33, 33.33, 33.34]);
  });
  it("splits equally between the chosen members only", () => {
    const m = expenseShares(90, { mode: "equal", members: ["a", "b"] }, all);
    expect(m.get("a")).toBe(45);
    expect(m.get("b")).toBe(45);
    expect(m.has("c")).toBe(false);
  });
  it("splits by percent", () => {
    const m = expenseShares(200, { mode: "percent", members: ["a", "b", "c"], shares: { a: 50, b: 30, c: 20 } }, all);
    expect([m.get("a"), m.get("b"), m.get("c")]).toEqual([100, 60, 40]);
  });
  it("splits by flat amounts of the items", () => {
    const m = expenseShares(100, { mode: "amount", members: ["a", "b"], shares: { a: 70, b: 30 } }, all);
    expect([m.get("a"), m.get("b")]).toEqual([70, 30]);
  });
  it("takes an included service charge out of the items and shares it in proportion", () => {
    // 110 paid with 10% service: items are 100, service 10. A had 75 of the items, B 25.
    const spec: SplitSpec = { mode: "amount", members: ["a", "b"], shares: { a: 75, b: 25 }, servicePct: 10, serviceSplit: "proportional" };
    expect(itemsOf(110, 10)).toBeCloseTo(100, 6);
    const m = expenseShares(110, spec, all);
    expect([m.get("a"), m.get("b")]).toEqual([82.5, 27.5]);
  });
  it("can share the service charge equally instead", () => {
    const spec: SplitSpec = { mode: "amount", members: ["a", "b"], shares: { a: 75, b: 25 }, servicePct: 10, serviceSplit: "equal" };
    const m = expenseShares(110, spec, all);
    expect([m.get("a"), m.get("b")]).toEqual([80, 30]);
    expect(sum(m)).toBe(110);
  });
  it("ignores people who are not travelers, and returns nothing without travelers", () => {
    expect(expenseShares(10, { mode: "equal", members: ["zzz"] }, all).size).toBe(0);
    expect(expenseShares(10, null, []).size).toBe(0);
  });
  it("a refund (negative amount) splits the same way", () => {
    const m = expenseShares(-30, null, all);
    expect(sum(m)).toBe(-30);
  });
});

describe("splitProblem", () => {
  it("wants people, percentages that total 100 and amounts that total the items", () => {
    expect(splitProblem({ mode: "equal", members: [] }, 10)).toMatch(/at least one/);
    expect(splitProblem({ mode: "percent", members: ["a", "b"], shares: { a: 60, b: 30 } }, 10)).toMatch(/90, not 100/);
    expect(splitProblem({ mode: "percent", members: ["a", "b"], shares: { a: 60, b: 40 } }, 10)).toBeNull();
    expect(splitProblem({ mode: "amount", members: ["a", "b"], shares: { a: 60, b: 30 } }, 100)).toMatch(/items come to 100/);
    expect(splitProblem({ mode: "amount", members: ["a", "b"], shares: { a: 60, b: 40 }, servicePct: 10 }, 110)).toBeNull();
  });
});

describe("parseSplit and specToStore", () => {
  it("reads a stored split, and anything odd as no split", () => {
    expect(parseSplit(null)).toBeNull();
    expect(parseSplit({ mode: "nope" })).toBeNull();
    expect(parseSplit({ mode: "equal", members: [] })).toBeNull();
    expect(parseSplit({ mode: "equal", members: ["a", 5] })).toEqual({ mode: "equal", members: ["a"] });
    expect(parseSplit({ mode: "percent", shares: { a: 60, b: "x", c: 40 }, servicePct: 12 })).toEqual({
      mode: "percent",
      members: ["a", "c"],
      shares: { a: 60, c: 40 },
      servicePct: 12,
      serviceSplit: "proportional",
    });
  });
  it("stores nothing for plain equal-between-everyone", () => {
    expect(specToStore({ mode: "equal", members: ["a", "b", "c"] }, all)).toBeNull();
    expect(specToStore({ mode: "equal", members: ["a", "b"] }, all)).not.toBeNull();
    expect(specToStore({ mode: "equal", members: all, servicePct: 10, serviceSplit: "equal" }, all)).not.toBeNull();
  });
});
