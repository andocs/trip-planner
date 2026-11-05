import { describe, expect, it } from "vitest";
import { applyChange } from "./realtime-apply";

type R = { id: string; trip_id: string; name: string };
const T = "trip-1";
const rows: R[] = [
  { id: "a", trip_id: T, name: "Aq" },
  { id: "b", trip_id: T, name: "Jam" },
];

describe("applyChange", () => {
  it("adds inserted rows from this trip", () => {
    const out = applyChange(rows, { eventType: "INSERT", new: { id: "c", trip_id: T, name: "Kai" } }, { tripId: T });
    expect(out?.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("treats an echo of our own optimistic insert as an update", () => {
    const out = applyChange(rows, { eventType: "INSERT", new: { id: "a", trip_id: T, name: "Aq" } }, { tripId: T });
    expect(out).toHaveLength(2);
  });

  it("updates rows in place", () => {
    const out = applyChange(rows, { eventType: "UPDATE", new: { id: "b", trip_id: T, name: "Jamie" } }, { tripId: T });
    expect(out?.[1].name).toBe("Jamie");
    expect(rows[1].name).toBe("Jam"); // input untouched
  });

  it("ignores rows from another trip", () => {
    const out = applyChange(
      rows,
      { eventType: "INSERT", new: { id: "x", trip_id: "other", name: "?" } },
      { tripId: T },
    );
    expect(out).toBe(rows);
  });

  it("removes deleted rows and ignores unknown ids (unfiltered delete events)", () => {
    expect(applyChange(rows, { eventType: "DELETE", old: { id: "a" } }, { tripId: T })?.map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(applyChange(rows, { eventType: "DELETE", old: { id: "zzz" } }, { tripId: T })).toBe(rows);
  });

  it("does not resurrect a row waiting in the Undo window", () => {
    const pending = new Set(["c"]);
    const out = applyChange(
      rows,
      { eventType: "UPDATE", new: { id: "c", trip_id: T, name: "late" } },
      { tripId: T, pendingDeletes: pending },
    );
    expect(out).toBe(rows);
  });

  it("leaves an empty cache alone", () => {
    expect(applyChange(undefined, { eventType: "INSERT", new: rows[0] }, { tripId: T })).toBeUndefined();
  });
});
