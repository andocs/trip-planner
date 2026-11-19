import { describe, expect, it, vi } from "vitest";
import type { ExportData } from "@/lib/export";
import { applyBackup } from "./backup-apply";
import { BACKUP_TABLES, BackupError, buildBackup, csvCell, expensesCsv, parseBackup } from "./backup";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const trip = {
  id: id(1),
  name: "Vietnam '26",
  destination: "Vietnam",
  start_date: "2026-06-16",
  end_date: "2026-06-26",
  home_currency: "PHP",
  foreign_currency: "VND",
  rate: 0.002457,
  rate_date: "2026-06-01",
  budget: 100000,
  map_region: "vn",
  timezone: "Asia/Manila",
  join_token: "SECRET-TOKEN",
  owner_id: "owner-uuid",
};
const empty = Object.fromEntries(BACKUP_TABLES.map((t) => [t, []]));
const data = {
  ...empty,
  trip,
  travelers: [{ id: id(10), trip_id: trip.id, name: "Aq", sort: 1, user_id: "linked-account", created_at: "2026-01-01T00:00:00Z" }],
  categories: [{ id: id(20), trip_id: trip.id, name: "Food", planned: 5000, sort: 1, created_at: "2026-01-01T00:00:00Z" }],
  expenses: [
    { id: id(30), trip_id: trip.id, spent_on: "2026-06-17", description: '=HYPERLINK("x")', category_id: id(20), paid_by: id(10), currency: "VND", amount: 100000, rate: 0.0025, note: "a, b", created_at: "2026-06-17T00:00:00Z" },
    { id: id(31), trip_id: trip.id, spent_on: "2026-06-16", description: "Taxi", category_id: null, paid_by: null, currency: "PHP", amount: 500, rate: null, note: null, created_at: "2026-06-16T00:00:00Z" },
  ],
  flights: [{ id: id(40), trip_id: trip.id, airline: "Cebu Pacific", booking_ref: "PNR123", has_ref: true, created_at: "2026-01-01T00:00:00Z" }],
} as unknown as ExportData;

describe("buildBackup", () => {
  const b = buildBackup(data, new Date("2026-07-01T00:00:00Z"));
  it("carries the trip settings and every table, with ids", () => {
    expect(b).toMatchObject({ format: "trip-planner-backup", version: 1, exportedAt: "2026-07-01T00:00:00.000Z" });
    expect(b.trip).toMatchObject({ name: "Vietnam '26", rate: 0.002457, timezone: "Asia/Manila" });
    expect(Object.keys(b.tables)).toEqual([...BACKUP_TABLES]);
    expect(b.tables.expenses.map((r) => r.id)).toEqual([id(30), id(31)]);
  });
  it("never includes the invite link, the owner, linked accounts, booking references or trip ids", () => {
    const text = JSON.stringify(b);
    for (const secret of ["SECRET-TOKEN", "owner-uuid", "linked-account", "PNR123", "trip_id", "join_token", "booking_ref", "has_ref"])
      expect(text).not.toContain(secret);
  });
});

describe("parseBackup", () => {
  const good = JSON.stringify(buildBackup(data));
  it("reads back what it wrote", () => {
    const p = parseBackup(good);
    expect(p.tables.travelers).toHaveLength(1);
    expect(p.trip.name).toBe("Vietnam '26");
  });
  it.each([
    ["not json", "nope"],
    ["wrong format", JSON.stringify({ format: "other" })],
    ["a future version", JSON.stringify({ ...JSON.parse(good), version: 2 })],
    ["a damaged table", JSON.stringify({ ...JSON.parse(good), tables: { travelers: "x" } })],
    ["a row without an id", JSON.stringify({ ...JSON.parse(good), tables: { travelers: [{ name: "x" }] } })],
    ["a row with a bad id", JSON.stringify({ ...JSON.parse(good), tables: { travelers: [{ id: "1; drop table", name: "x" }] } })],
  ])("refuses %s with a plain message", (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });
  it("strips a trip id, a linked account and a booking reference a hand-edited file added", () => {
    const edited = JSON.parse(good);
    edited.tables.travelers[0].user_id = "someone";
    edited.tables.travelers[0].trip_id = "other-trip";
    edited.tables.flights[0].booking_ref = "PNR9";
    const p = parseBackup(JSON.stringify(edited));
    expect(p.tables.travelers[0]).not.toHaveProperty("user_id");
    expect(p.tables.travelers[0]).not.toHaveProperty("trip_id");
    expect(p.tables.flights[0]).not.toHaveProperty("booking_ref");
  });
  it("ignores unknown trip fields", () => {
    const edited = JSON.parse(good);
    edited.trip.owner_id = "x";
    expect(parseBackup(JSON.stringify(edited)).trip).not.toHaveProperty("owner_id");
  });
});

describe("expensesCsv", () => {
  const csv = expensesCsv(data);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  it("has a header and one row per expense, oldest first", () => {
    expect(lines[0]).toBe("Date,Description,Category,Paid by,Currency,Amount,Amount (PHP),Rate used,Note");
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith("2026-06-16,Taxi")).toBe(true);
  });
  it("converts with the expense's own rate and quotes commas", () => {
    expect(lines[2]).toContain(",VND,100000,250,0.0025,");
    expect(lines[2].endsWith('"a, b"')).toBe(true);
  });
  it("defuses spreadsheet formulas", () => {
    expect(lines[2]).toContain("'=HYPERLINK");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(-5)).toBe("-5"); // a real negative number stays a number
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

/** A recording stand-in for the Supabase client. `fail` makes one table's insert fail. */
function fakeClient(opts: { existing?: Record<string, number>; defaults?: string[]; fail?: string; failWith?: string } = {}) {
  const log: string[] = [];
  const from = (table: string) => ({
    select: (_cols: string, o?: { head?: boolean }) => ({
      eq: async () =>
        o?.head
          ? { count: opts.existing?.[table] ?? 0, error: null }
          : { data: (opts.defaults ?? []).map((i) => ({ id: i })), error: null },
    }),
    insert: async (rows: { id: string; trip_id: string }[]) => {
      if (opts.fail === table) return { error: { message: opts.failWith ?? "boom" } };
      log.push(`insert ${table} ${rows.length} trip=${rows[0]?.trip_id}`);
      return { error: null };
    },
    delete: () => ({
      in: (_c: string, ids: string[]) => ({
        eq: async () => {
          log.push(`delete ${table} ${ids.length}`);
          return { error: null };
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        log.push(`update ${table} ${Object.keys(patch).length} fields`);
        return { error: null };
      },
    }),
  });
  return { client: { from: vi.fn(from) } as never, log };
}

describe("applyBackup", () => {
  const backup = parseBackup(JSON.stringify(buildBackup(data)));

  it("inserts tables in foreign-key order into the given trip, then the settings, then drops the default categories", async () => {
    const { client, log } = fakeClient({ defaults: ["default-cat"] });
    const res = await applyBackup(client, "new-trip", backup);
    expect(res.rows).toBe(1 + 1 + 2 + 1); // travelers, categories, expenses, flights
    expect(log.filter((l) => l.startsWith("insert")).map((l) => l.split(" ")[1])).toEqual(["travelers", "categories", "expenses", "flights"]);
    expect(log.every((l) => !l.startsWith("insert") || l.endsWith("trip=new-trip"))).toBe(true);
    expect(log).toContain("update trips 11 fields");
    expect(log.at(-1)).toBe("delete categories 1");
  });

  it("refuses a trip that already has data and writes nothing", async () => {
    const { client, log } = fakeClient({ existing: { expenses: 3 } });
    await expect(applyBackup(client, "t", backup)).rejects.toThrow(/empty trip/);
    expect(log).toEqual([]);
  });

  it("undoes what it inserted when a later table fails", async () => {
    const { client, log } = fakeClient({ fail: "flights" });
    await expect(applyBackup(client, "t", backup)).rejects.toThrow("flights: boom");
    const deletes = log.filter((l) => l.startsWith("delete")).map((l) => l.split(" ")[1]);
    expect(deletes).toEqual(["expenses", "categories", "travelers"]); // reverse order
  });

  it("explains a clash with the original trip's ids", async () => {
    const { client } = fakeClient({ fail: "travelers", failWith: 'duplicate key value violates unique constraint "travelers_pkey"' });
    await expect(applyBackup(client, "t", backup)).rejects.toThrow(/original trip is gone/);
  });
});
