import { describe, expect, it } from "vitest";
import {
  addDays,
  bookedProgress,
  dayNumberFor,
  daysBetween,
  daysToGo,
  homeAmount,
  localISODate,
  menuHomePrice,
  packedProgress,
  percentUsed,
  pricePerNight,
  remaining,
  settleUp,
  spentByCategory,
  stayNights,
  totalSpent,
  tripLength,
  tripNights,
} from "./calc";

const trip = { foreign_currency: "VND", rate: 0.002457 };

describe("currency conversion", () => {
  it("converts foreign-currency amounts at the trip rate", () => {
    expect(homeAmount({ currency: "VND", amount: 80_000 }, trip)).toBeCloseTo(196.56, 2);
  });

  it("leaves home-currency amounts alone", () => {
    expect(homeAmount({ currency: "PHP", amount: 2312.04 }, trip)).toBe(2312.04);
  });

  it("accepts numeric strings from Postgres numeric columns", () => {
    expect(
      homeAmount({ currency: "VND", amount: "100000" }, { foreign_currency: "VND", rate: "0.002457" }),
    ).toBeCloseTo(245.7, 6);
  });

  it("computes menu prices in home currency", () => {
    expect(menuHomePrice(80_000, 0.002457)).toBeCloseTo(196.56, 2);
    expect(menuHomePrice(null, 0.002457)).toBeNull();
  });

  it("sums totals and per-category spend", () => {
    const expenses = [
      { currency: "PHP", amount: 1000, category_id: "food" },
      { currency: "VND", amount: 100_000, category_id: "food" },
      { currency: "PHP", amount: 500, category_id: null },
    ];
    expect(totalSpent(expenses, trip)).toBeCloseTo(1745.7, 6);
    const byCat = spentByCategory(expenses, trip);
    expect(byCat.get("food")).toBeCloseTo(1245.7, 6);
    expect(byCat.get("none")).toBe(500);
  });
});

describe("budget", () => {
  it("computes remaining and percent used", () => {
    expect(remaining(118_165, 18_165)).toBe(100_000);
    expect(remaining(1000, 1500)).toBe(-500);
    expect(percentUsed(1000, 250)).toBe(25);
  });

  it("guards a zero budget", () => {
    expect(percentUsed(0, 500)).toBe(0);
    expect(percentUsed("0", 0)).toBe(0);
    expect(remaining(0, 500)).toBe(-500);
  });
});

describe("settleUp", () => {
  const aq = { id: "aq", name: "Aq" };
  const jam = { id: "jam", name: "Jam" };
  const kai = { id: "kai", name: "Kai" };

  it("splits evenly between two travelers", () => {
    const s = settleUp(
      [
        { currency: "PHP", amount: 2312.04, paid_by: "jam" },
        { currency: "PHP", amount: 1000, paid_by: "aq" },
      ],
      [aq, jam],
      trip,
    );
    expect(s.total).toBe(3312.04);
    expect(s.share).toBe(1656.02);
    expect(s.rows.find((r) => r.traveler.id === "aq")?.balance).toBe(-656.02);
    expect(s.transfers).toEqual([{ from: aq, to: jam, amount: 656.02 }]);
  });

  it("uses home amounts for foreign-currency expenses", () => {
    const s = settleUp([{ currency: "VND", amount: 1_000_000, paid_by: "aq" }], [aq, jam], trip);
    expect(s.total).toBe(2457);
    expect(s.transfers).toEqual([{ from: jam, to: aq, amount: 1228.5 }]);
  });

  it("finds minimal transfers for three travelers", () => {
    const s = settleUp(
      [
        { currency: "PHP", amount: 900, paid_by: "aq" },
        { currency: "PHP", amount: 300, paid_by: "jam" },
      ],
      [aq, jam, kai],
      trip,
    );
    // share 400: Aq +500, Jam −100, Kai −400
    expect(s.transfers).toEqual([
      { from: kai, to: aq, amount: 400 },
      { from: jam, to: aq, amount: 100 },
    ]);
  });

  it("counts payer-less expenses in the total but not in anyone's paid", () => {
    const s = settleUp(
      [
        { currency: "PHP", amount: 600, paid_by: "aq" },
        { currency: "PHP", amount: 300, paid_by: null },
      ],
      [aq, jam, kai],
      trip,
    );
    expect(s.total).toBe(900);
    expect(s.share).toBe(300);
    expect(s.unassigned).toBe(300);
    expect(s.rows.map((r) => r.balance)).toEqual([300, -300, -300]);
    // Only Aq is owed money; the leftover 300 comes from the unassigned expense.
    expect(s.transfers).toEqual([{ from: jam, to: aq, amount: 300 }]);
  });

  it("treats a payer who was removed as unassigned", () => {
    const s = settleUp([{ currency: "PHP", amount: 100, paid_by: "ghost" }], [aq, jam], trip);
    expect(s.unassigned).toBe(100);
  });

  it("ignores balances under 0.5", () => {
    const s = settleUp(
      [
        { currency: "PHP", amount: 100.6, paid_by: "aq" },
        { currency: "PHP", amount: 100, paid_by: "jam" },
      ],
      [aq, jam],
      trip,
    );
    expect(s.transfers).toEqual([]);
  });

  it("guards zero travelers", () => {
    const s = settleUp([{ currency: "PHP", amount: 100, paid_by: null }], [], trip);
    expect(s).toMatchObject({ total: 100, share: 0, rows: [], transfers: [], unassigned: 100 });
  });

  it("handles no expenses", () => {
    const s = settleUp([], [aq, jam], trip);
    expect(s.total).toBe(0);
    expect(s.transfers).toEqual([]);
  });
});

describe("dates", () => {
  it("computes trip length and nights inclusively", () => {
    expect(tripLength("2026-06-16", "2026-06-26")).toBe(11);
    expect(tripNights("2026-06-16", "2026-06-26")).toBe(10);
    expect(tripLength("2026-06-16", "2026-06-16")).toBe(1);
    expect(tripLength("2026-06-16", null)).toBeNull();
    expect(tripLength("2026-06-26", "2026-06-16")).toBeNull();
  });

  it("counts down before the trip", () => {
    expect(daysToGo("2026-06-01", "2026-06-16", "2026-06-26")).toEqual({ kind: "before", n: 15 });
    expect(daysToGo("2026-06-15", "2026-06-16", "2026-06-26")).toEqual({ kind: "before", n: 1 });
  });

  it("shows Day X of N during the trip, inclusive of both ends", () => {
    expect(daysToGo("2026-06-16", "2026-06-16", "2026-06-26")).toEqual({ kind: "during", n: 1, of: 11 });
    expect(daysToGo("2026-06-20", "2026-06-16", "2026-06-26")).toEqual({ kind: "during", n: 5, of: 11 });
    expect(daysToGo("2026-06-26", "2026-06-16", "2026-06-26")).toEqual({ kind: "during", n: 11, of: 11 });
  });

  it("reports completed after the last day", () => {
    expect(daysToGo("2026-06-27", "2026-06-16", "2026-06-26")).toEqual({ kind: "after", n: 1 });
  });

  it("treats a missing end date as a one-day trip, and a missing start as unset", () => {
    expect(daysToGo("2026-06-16", "2026-06-16", null)).toEqual({ kind: "during", n: 1, of: 1 });
    expect(daysToGo("2026-06-16", null, "2026-06-26")).toEqual({ kind: "unset" });
  });

  it("spans DST changes without an off-by-one", () => {
    // US spring forward is 2026-03-08, EU fall back is 2026-10-25: both 23/25-hour days.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysToGo("2026-03-07", "2026-03-09", "2026-03-10")).toEqual({ kind: "before", n: 2 });
    expect(daysToGo("2026-03-09", "2026-03-07", "2026-03-10")).toEqual({ kind: "during", n: 3, of: 4 });
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("reads today from the local calendar, not UTC", () => {
    // Tests run with TZ=America/New_York (see vitest.config.mts).
    // 00:30 on the DST day itself, and 23:30 local (already the next day in UTC).
    expect(localISODate(new Date(2026, 2, 8, 0, 30))).toBe("2026-03-08");
    expect(localISODate(new Date(2026, 5, 15, 23, 30))).toBe("2026-06-15");
    expect(new Date(2026, 5, 15, 23, 30).toISOString().slice(0, 10)).toBe("2026-06-16");
  });

  it("numbers trip days from the start date", () => {
    expect(dayNumberFor("2026-06-16", "2026-06-16")).toBe(1);
    expect(dayNumberFor("2026-06-19", "2026-06-16")).toBe(4);
  });
});

describe("stays", () => {
  it("computes nights and price per night", () => {
    expect(stayNights("2026-06-17", "2026-06-19")).toBe(2);
    expect(pricePerNight(21_944.1, 2)).toBeCloseTo(10_972.05, 6);
  });

  it("guards zero or missing nights", () => {
    expect(stayNights("2026-06-17", null)).toBeNull();
    expect(pricePerNight(1000, 0)).toBeNull();
    expect(pricePerNight(null, 2)).toBeNull();
  });
});

describe("progress", () => {
  it("returns 0% for empty lists", () => {
    expect(packedProgress([]).percent).toBe(0);
  });

  it("counts Booked (and Done) and ignores Cancelled", () => {
    const p = bookedProgress([{ status: "Booked" }, { status: "Priced" }, { status: "Cancelled" }, { status: "Done" }]);
    expect(p).toEqual({ done: 2, total: 3, percent: (2 / 3) * 100 });
  });
});
