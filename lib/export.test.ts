import { describe, expect, it } from "vitest";
import seed from "../seed/vietnam26.seed.json";
import { buildWorkbook, exportFileName, type ExportData } from "./export";
import { buildSeedPlan, INSERT_ORDER } from "./seed-map";
import { staysOf } from "./stays";

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
  // Stays are the booked hotel ideas (migration 31), as fetchExportData derives them.
  data.stays = staysOf(data.hotel_ideas);
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
    timezone: "Asia/Manila",
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
    expect(sheet("Attractions").rows).toHaveLength(1 + 28); // 36 in the seed; 8 are Idea/Maybe/Cancelled, so not confirmed
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

  it("exports only confirmed ideas and solid itinerary stops", () => {
    const data = seededData();
    const confirmed = (rows: { decision: string }[]) => rows.filter((r) => r.decision === "confirmed").length;
    const rowsOf = (name: string, ds: ReturnType<typeof buildWorkbook>) => ds.find((x) => x.name === name)!.rows;
    // Seed: Idea/Maybe places are drafts, Cancelled ones are dropped (see decisionForStatus).
    expect(rowsOf("Attractions", buildWorkbook(data))).toHaveLength(1 + confirmed(data.attractions));
    expect(data.attractions.some((a) => a.decision === "draft")).toBe(true);

    const mutated = seededData();
    mutated.food_places[0].decision = "draft";
    mutated.food_places[1].decision = "dropped";
    mutated.hotel_ideas[0].decision = "draft";
    mutated.itinerary_items[0].tentative = true;
    const wb = buildWorkbook(mutated);
    const base = buildWorkbook(seededData());
    expect(rowsOf("Itinerary", wb)).toHaveLength(rowsOf("Itinerary", base).length - 1);
    expect(rowsOf("Food", wb)).toHaveLength(rowsOf("Food", base).length - 2); // one draft + one dropped
    expect(rowsOf("Stays", wb)).toHaveLength(rowsOf("Stays", base).length - 1); // one draft hotel idea
  });

  it("makes a safe file name", () => {
    expect(exportFileName("Vietnam '26")).toBe("Vietnam 26.xlsx");
    expect(exportFileName("../../etc")).toBe("etc.xlsx");
    expect(exportFileName("")).toBe("Trip.xlsx");
  });
});
