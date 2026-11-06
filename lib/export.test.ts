import { describe, expect, it } from "vitest";
import seed from "../seed/vietnam26.seed.json";
import { buildWorkbook, exportFileName, type ExportData } from "./export";
import { buildSeedPlan, INSERT_ORDER } from "./seed-map";

function seededData(): ExportData {
  let i = 0;
  const cats = [
    "Flights",
    "Accommodation",
    "Food & Drinks",
    "Transport",
    "Activities & Tickets",
    "Shopping & Pasalubong",
    "SIM & Misc",
    "Other",
  ];
  const now = "2026-01-01T00:00:00Z";
  const plan = buildSeedPlan(
    seed,
    cats.map((name, k) => ({ id: `c${k}`, name })),
    () => `id-${i++}`,
  );
  const withMeta = <T extends object>(rows: T[]) => rows.map((r) => ({ trip_id: "t", created_at: now, ...r }));
  const data = Object.fromEntries(
    INSERT_ORDER.map((t) => [t, withMeta(plan.rows[t] as object[])]),
  ) as unknown as ExportData;
  data.categories = cats.map((name, k) => ({
    id: `c${k}`,
    trip_id: "t",
    name,
    sort: k,
    created_at: now,
    planned: plan.categoryUpdates.find((u) => u.id === `c${k}`)?.planned ?? null,
  }));
  data.trip = {
    id: "t",
    join_token: "x",
    archived_at: null,
    created_at: now,
    owner_id: null,
    status: "active",
    onboarding_step: 1,
    invite_rotated_at: now,
    rate_date: null,
    ...plan.trip,
  };
  return data;
}

describe("Excel export", () => {
  const sheets = buildWorkbook(seededData());
  const sheet = (name: string) => sheets.find((s) => s.name === name)!;

  it("has the workbook tabs from the acceptance checklist", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "Trip",
      "Budget",
      "Expenses",
      "Itinerary",
      "Flights",
      "Stays",
      "Food",
      "Attractions",
      "Packing",
    ]);
  });

  it("writes one row per record under each header", () => {
    expect(sheet("Expenses").rows).toHaveLength(1 + 5);
    expect(sheet("Itinerary").rows).toHaveLength(1 + 140);
    expect(sheet("Attractions").rows).toHaveLength(1 + 36);
  });

  it("includes computed values: home amounts, budget totals, settle up, menu prices", () => {
    const budget = sheet("Budget").rows;
    expect(budget.find((r) => r[0] === "Total")).toEqual(["Total", null, 14478.08, 103686.92]);
    expect(budget.find((r) => r[0] === "Aq")?.[3]).toBe(-7239.04);
    const menu = sheet("Food").rows.find((r) => r[1] === "Bun Cha Ta (Grilled Pork, Rice Noodles)");
    expect(menu?.slice(2)).toEqual([80000, 196.56]);
    const stay = sheet("Stays").rows.find((r) => r[2] === "To be decided" && r[1] === "Hanoi");
    expect(stay?.[6]).toBe(2);
    expect(stay?.[8]).toBe(10972.05);
  });

  it("makes a safe file name", () => {
    expect(exportFileName("Vietnam '26")).toBe("Vietnam 26.xlsx");
    expect(exportFileName("../../etc")).toBe("etc.xlsx");
    expect(exportFileName("")).toBe("Trip.xlsx");
  });
});
