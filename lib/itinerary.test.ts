import { describe, expect, it } from "vitest";
import {
  byOrder,
  connectorDetails,
  connectorLabel,
  connectorProblem,
  dateForDay,
  dayOf,
  dayTotals,
  endPosition,
  groupDays,
  insertProblem,
  LONG_DAY_MINUTES,
  planInsert,
  planMove,
  positionBetween,
  stayMarks,
  timeLine,
  type Item,
} from "./itinerary";

let n = 0;
const mk = (over: Partial<Item> = {}): Item => ({
  id: `i${++n}`,
  day: 1,
  on_date: null,
  at_time: null,
  activity: "x",
  duration_min: null,
  created_at: `2026-06-01T00:00:${String(n).padStart(2, "0")}Z`,
  position: null,
  kind: "stop",
  tentative: false,
  ...over,
});
const START = "2026-06-18";

describe("days", () => {
  it("derives a date from the trip start and a day number", () => {
    expect(dateForDay(START, 1)).toBe("2026-06-18");
    expect(dateForDay(START, 3)).toBe("2026-06-20");
    expect(dateForDay(null, 3)).toBeNull();
    expect(dateForDay(START, null)).toBeNull();
  });
  it("the stored day wins; an old item with only a date gets its day from the start", () => {
    expect(dayOf({ day: 4, on_date: "2026-06-18" }, START)).toBe(4);
    expect(dayOf({ day: null, on_date: "2026-06-20" }, START)).toBe(3);
    expect(dayOf({ day: null, on_date: null }, START)).toBeNull();
  });
  it("keeps empty trip days, so something can be dragged onto them, and puts unscheduled last", () => {
    const g = groupDays([mk({ day: 2, position: 1000 }), mk({ day: null })], START, 3);
    expect(g.map((x) => [x.day, x.items.length])).toEqual([[1, 0], [2, 1], [3, 0], [null, 1]]);
    expect(g[1].date).toBe("2026-06-19");
  });
});

describe("order", () => {
  it("uses the saved position, then time, then creation", () => {
    const a = mk({ position: 2000 });
    const b = mk({ position: 1000 });
    const c = mk({ position: null, at_time: "08:00" });
    const d = mk({ position: null, at_time: "07:00" });
    expect([a, b, c, d].sort(byOrder).map((x) => x.id)).toEqual([b.id, a.id, d.id, c.id]);
  });
  it("finds a position between neighbours, or beyond either end", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(null, 1000)).toBe(0);
    expect(positionBetween(3000, null)).toBe(4000);
    expect(positionBetween(null, null)).toBe(1000);
    expect(endPosition([mk({ position: 1000 }), mk({ position: 5000 })])).toBe(6000);
    expect(endPosition([])).toBe(1000);
  });
});

describe("connector rules", () => {
  const S = { kind: "stop" } as Item;
  const C = { kind: "commute" } as Item;
  const B = { kind: "buffer" } as Item;
  it("allows a connector between two places", () => {
    expect(connectorProblem([S, C, S])).toBeNull();
    expect(connectorProblem([S, C, B, S])).toBeNull(); // different kinds may touch
    expect(connectorProblem([])).toBeNull();
  });
  it("refuses a connector first or last in a day", () => {
    expect(connectorProblem([C, S])).toMatch(/first/);
    expect(connectorProblem([S, B])).toMatch(/last/);
  });
  it("refuses two of the same kind side by side", () => {
    expect(connectorProblem([S, C, C, S])).toMatch(/commutes/);
    expect(connectorProblem([S, B, B, S])).toMatch(/breaks/);
  });
  it("checks an insert before it happens", () => {
    expect(insertProblem([S, S], 1, "commute")).toBeNull();
    expect(insertProblem([S, S], 0, "commute")).toMatch(/first/);
    expect(insertProblem([S, C, S], 2, "buffer")).toBeNull(); // a break after a commute is fine
    expect(insertProblem([S, C, S], 2, "commute")).toMatch(/side by side/);
    expect(insertProblem([S, C, S], 1, "commute")).toMatch(/side by side/);
  });
});

describe("planMove", () => {
  const a = mk({ id: "a", position: 1000 });
  const b = mk({ id: "b", position: 2000 });
  const c = mk({ id: "c", position: 3000 });
  it("changes one row when moving within a day", () => {
    const r = planMove([a, b, c], "c", 1, 1, START);
    expect(r).toEqual({ ok: true, updates: [{ id: "c", day: 1, position: 1500, on_date: "2026-06-18" }] });
  });
  it("moves to another day, and writes the derived date", () => {
    const d2 = mk({ id: "d", day: 2, position: 1000 });
    const r = planMove([a, b, d2], "a", 2, 1, START);
    expect(r).toEqual({ ok: true, updates: [{ id: "a", day: 2, position: 2000, on_date: "2026-06-19" }] });
  });
  it("moves onto an empty day and to the front", () => {
    expect(planMove([a, b], "a", 3, 0, START)).toEqual({ ok: true, updates: [{ id: "a", day: 3, position: 1000, on_date: "2026-06-20" }] });
    expect(planMove([a, b], "b", 1, 0, START)).toEqual({ ok: true, updates: [{ id: "b", day: 1, position: 0, on_date: "2026-06-18" }] });
  });
  it("numbers the day again when the gap has run out", () => {
    const x = mk({ id: "x", position: 1000 });
    const y = mk({ id: "y", position: 1000.000000001 });
    const z = mk({ id: "z", position: 5000 });
    const r = planMove([x, y, z], "z", 1, 1, START);
    expect(r.ok && r.updates.map((u) => [u.id, u.position])).toEqual([["x", 1000], ["z", 2000], ["y", 3000]]);
  });
  it("numbers a day that never had positions", () => {
    const p = mk({ id: "p", position: null, at_time: "08:00" });
    const q = mk({ id: "q", position: null, at_time: "09:00" });
    const r = planMove([p, q], "q", 1, 0, START);
    expect(r.ok && r.updates.map((u) => u.id)).toEqual(["q", "p"]);
  });
  it("refuses a move that breaks the connector rules, and allows one that keeps them", () => {
    const s1 = mk({ id: "s1", position: 1000 });
    const c1 = mk({ id: "c1", position: 2000, kind: "commute" });
    const s2 = mk({ id: "s2", position: 3000 });
    const s3 = mk({ id: "s3", position: 4000 });
    expect(planMove([s1, c1, s2, s3], "s3", 1, 1, START)).toMatchObject({ ok: true }); // [s1, s3, c1, s2]
    expect(planMove([s1, c1, s2, s3], "s1", 1, 1, START)).toMatchObject({ ok: false }); // [c1, s1, ...]: commute first
    expect(planMove([s1, c1, s2, s3], "s3", 1, 3, START)).toMatchObject({ ok: true }); // [s1, c1, s2, s3] unchanged order
    expect(planMove([s1, c1, s2], "s2", 1, 1, START)).toMatchObject({ ok: false }); // [s1, s2, c1]: commute last
    expect(planMove([s1], "nope", 1, 0, START)).toMatchObject({ ok: false });
  });
});

describe("dayTotals", () => {
  it("adds activity, commute and break, and ignores tentative stops", () => {
    const t = dayTotals([
      mk({ duration_min: 60 }),
      mk({ kind: "commute", duration_min: 12 }),
      mk({ duration_min: 180 }),
      mk({ kind: "buffer", duration_min: 45 }),
      mk({ duration_min: 600, tentative: true }),
    ]);
    expect(t).toEqual({ activity: 240, commute: 12, buffer: 45, total: 297, long: false });
  });
  it("flags a long day only above the constant", () => {
    expect(dayTotals([mk({ duration_min: LONG_DAY_MINUTES })]).long).toBe(false);
    expect(dayTotals([mk({ duration_min: LONG_DAY_MINUTES + 1 })]).long).toBe(true);
    expect(dayTotals([]).total).toBe(0);
  });
});

describe("connector details", () => {
  it("reads only what is valid", () => {
    expect(connectorDetails({ mode: "taxi", cost: 180, note: "Grab", junk: 1 })).toEqual({ mode: "taxi", bufferKind: undefined, cost: 180, note: "Grab" });
    expect(connectorDetails({ cost: -5 })).toEqual({ mode: undefined, bufferKind: undefined, cost: undefined, note: undefined });
    expect(connectorDetails("x")).toEqual({ mode: undefined, bufferKind: undefined, cost: undefined, note: undefined });
  });
  it("labels a commute and a break", () => {
    expect(connectorLabel({ kind: "commute", activity: "", details: { mode: "taxi" } })).toBe("Taxi / Grab");
    expect(connectorLabel({ kind: "buffer", activity: "", details: { bufferKind: "meal" } })).toBe("Meal break");
    expect(connectorLabel({ kind: "buffer", activity: "Nap", details: {} })).toBe("Nap");
  });
});

describe("stays on the timeline", () => {
  it("appear on their check-in and check-out days, and not when cancelled", () => {
    const marks = stayMarks(
      [
        { id: "s1", hotel: "Old Quarter", status: "Booked", check_in: "2026-06-19", check_out: "2026-06-22" },
        { id: "s2", hotel: "Gone", status: "Cancelled", check_in: "2026-06-19", check_out: "2026-06-20" },
        { id: "s3", hotel: "Before", status: "Booked", check_in: "2026-06-01", check_out: "2026-06-18" },
      ],
      START,
    );
    expect(marks.map((m) => [m.kind, m.hotel, m.day])).toEqual([["in", "Old Quarter", 2], ["out", "Old Quarter", 5], ["out", "Before", 1]]);
    expect(stayMarks([{ id: "x", hotel: "H", status: "Booked", check_in: "2026-06-19", check_out: null }], null)).toEqual([]);
  });
});

describe("timeLine", () => {
  it("joins time and length", () => {
    expect(timeLine({ at_time: "08:00:00", duration_min: 60 })).toBe("08:00 · 1h");
    expect(timeLine({ at_time: null, duration_min: 90 })).toBe("1h 30m");
    expect(timeLine({ at_time: null, duration_min: null })).toBe("Any time");
  });
});

describe("planInsert", () => {
  const a = mk({ id: "a", position: 1000 });
  const b = mk({ id: "b", position: 2000 });
  it("slots between two numbered neighbours without touching anything else", () => {
    expect(planInsert([a, b], 1, 1, START)).toEqual({ position: 1500, renumber: [] });
    expect(planInsert([a, b], 2, 1, START)).toEqual({ position: 3000, renumber: [] });
  });
  it("numbers the day first when an item has no position yet", () => {
    const p = mk({ id: "p", position: null });
    const r = planInsert([a, p], 1, 1, START);
    expect(r.renumber.map((u) => [u.id, u.position])).toEqual([["a", 1000], ["p", 2000]]);
    expect(r.position).toBe(1500);
  });
});
