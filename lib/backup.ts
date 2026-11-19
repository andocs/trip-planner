import { homeAmount } from "@/lib/calc";
import type { ExportData } from "@/lib/export";

/**
 * A full-fidelity copy of a trip as one JSON file, and the CSV of its expenses. Pure: no React, no network.
 *
 * What is in a backup: the trip's settings and every table the Excel export has (travelers, destinations, categories,
 * expenses, itinerary, flights, transfers, stays, ideas, menu items, packing, gifts, reminders), with their ids so the
 * links between them survive. What is NOT in it, on purpose:
 *   - the invite link, the owner id and which account a traveler is linked to (a restored trip gets its own);
 *   - flight booking references (they live in an owner-only table and never leave it);
 *   - photos (the files live in Storage and need their own backup), votes and comments.
 * A backup still contains stay confirmation numbers and prices: tell people to keep the file private.
 */

export const BACKUP_FORMAT = "trip-planner-backup";
/** 2: stays are booked hotel ideas (no `stays` table). Version 1 files are still read and converted. */
export const BACKUP_VERSION = 2;

/** The tables a backup carries, in an order that satisfies foreign keys when they are inserted. */
export const BACKUP_TABLES = [
  "travelers",
  "destinations",
  "categories",
  "expenses",
  "itinerary_items",
  "flights",
  "transfers",
  "hotel_ideas",
  "food_places",
  "menu_items",
  "attractions",
  "packing_items",
  "gifts",
  "reminders",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Columns that are never written to, or read back from, a backup. */
const OMIT: Partial<Record<BackupTable, readonly string[]>> = {
  travelers: ["user_id"],
  flights: ["booking_ref", "has_ref"],
};
const TRIP_FIELDS = [
  "name",
  "destination",
  "start_date",
  "end_date",
  "home_currency",
  "foreign_currency",
  "rate",
  "rate_date",
  "budget",
  "map_region",
  "timezone",
] as const;

type Row = Record<string, unknown>;
export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  trip: Record<string, unknown>;
  tables: Record<BackupTable, Row[]>;
};

const clean = (table: BackupTable, row: Row): Row => {
  const omit = OMIT[table] ?? [];
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== "trip_id" && !omit.includes(k)));
};

export function buildBackup(d: ExportData, now: Date = new Date()): Backup {
  const trip = d.trip as unknown as Row;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    trip: Object.fromEntries(TRIP_FIELDS.map((k) => [k, trip[k] ?? null])),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((t) => [t, ((d as unknown as Record<string, Row[]>)[t] ?? []).map((r) => clean(t, r))]),
    ) as Record<BackupTable, Row[]>,
  };
}

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const MAX_ROWS_PER_TABLE = 5000;
/** Ids are uuids; the database enforces that. This only keeps junk and odd characters out before anything is sent. */
const UUID = /^[A-Za-z0-9_-]{1,64}$/;

export class BackupError extends Error {}

/** Reads and checks a backup file's text. Throws a BackupError with a plain-language reason. */
export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError("That file is too large to be a trip backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a trip backup (it isn't valid JSON).");
  }
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT)
    throw new BackupError("That file isn't a Trip Planner backup.");
  if (b.version !== BACKUP_VERSION && b.version !== 1)
    throw new BackupError(`That backup is version ${String(b.version)}; this app reads versions 1 and ${BACKUP_VERSION}.`);
  if (!b.trip || typeof b.trip !== "object" || !b.tables || typeof b.tables !== "object")
    throw new BackupError("That backup is missing its trip or tables.");

  const readTable = (name: string, clean: (r: Row) => Row): Row[] => {
    const rows = (b.tables as Record<string, unknown>)[name] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`The "${name}" part of the backup is damaged.`);
    if (rows.length > MAX_ROWS_PER_TABLE) throw new BackupError(`The "${name}" part of the backup is unreasonably large.`);
    return rows.map((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r) || typeof (r as Row).id !== "string" || !UUID.test((r as Row).id as string))
        throw new BackupError(`Row ${i + 1} of "${name}" has no valid id.`);
      return clean(r as Row);
    });
  };
  const tables = {} as Record<BackupTable, Row[]>;
  // A file edited by hand can't smuggle in a trip, a linked account or a booking reference.
  for (const t of BACKUP_TABLES) tables[t] = readTable(t, (r) => clean(t, r));
  if ((b.version as number) === 1) {
    // Version 1 kept stays in a table of their own; they are booked hotel ideas now (migration 31).
    const merged = mergeV1Stays(tables.hotel_ideas, readTable("stays", (r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "trip_id"))), tables.expenses);
    tables.hotel_ideas = merged.hotel_ideas;
    tables.expenses = merged.expenses;
  }
  const trip = Object.fromEntries(TRIP_FIELDS.filter((k) => k in (b.trip as Row)).map((k) => [k, (b.trip as Row)[k]]));
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: String(b.exportedAt ?? ""), trip, tables };
}

const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const nightsBetween = (a: unknown, b: unknown): number | null => {
  const x = typeof a === "string" ? Date.parse(a) : NaN;
  const y = typeof b === "string" ? Date.parse(b) : NaN;
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.round((y - x) / 86_400_000) : null;
};

/**
 * Version 1 backups: fold the old `stays` rows into the hotel ideas, by the same rules as migration 31. A stay with a hotel idea
 * behind it (details.ideaId) is merged into that idea; any other stay (or a second one on the same idea) becomes a new
 * idea with the stay's own id. Expenses logged from a stay are pointed at the idea. Pure.
 */
export function mergeV1Stays(ideas: Row[], stays: Row[], expenses: Row[]): { hotel_ideas: Row[]; expenses: Row[] } {
  const byId = new Map(ideas.map((i) => [String(i.id), i]));
  const claimed = new Set<string>();
  const merged = new Map<string, Row>();
  const added: Row[] = [];
  const target = new Map<string, string>(); // stay id -> the idea id that now holds it

  const booked = (s: Row, base: Row): Row => {
    const stayDetails = { ...obj(s.details) };
    delete stayDetails.ideaId; // there is only one row now
    return {
      ...base,
      is_stay: true,
      check_in: s.check_in ?? null,
      check_out: s.check_out ?? null,
      stay_status: typeof s.status === "string" ? s.status : "Planned",
      confirmation: s.confirmation ?? null,
      hotel: s.hotel,
      city: s.city ?? base.city ?? null,
      room: text(s.note) ?? base.room ?? null,
      total: s.total ?? base.total ?? null,
      nights: nightsBetween(s.check_in, s.check_out) ?? base.nights ?? null,
      details: { ...obj(base.details), ...stayDetails, ...(text(s.room) ? { rooms: text(s.room) } : {}) },
    };
  };

  for (const s of stays) {
    const linkId = text(obj(s.details).ideaId);
    const idea = linkId ? byId.get(linkId) : undefined;
    if (linkId && idea && !claimed.has(linkId)) {
      claimed.add(linkId);
      merged.set(linkId, booked(s, idea));
      target.set(String(s.id), linkId);
    } else {
      added.push(booked(s, { id: s.id, decision: "confirmed", created_at: s.created_at }));
      target.set(String(s.id), String(s.id));
    }
  }
  return {
    hotel_ideas: [...ideas.map((i) => merged.get(String(i.id)) ?? i), ...added],
    expenses: expenses.map((e) =>
      e.source_table === "stays"
        ? { ...e, source_table: target.has(String(e.source_id)) ? "hotel_ideas" : null, source_id: target.get(String(e.source_id)) ?? null }
        : e,
    ),
  };
}

export const backupFileName = (tripName: string, now: Date = new Date()) =>
  `${tripName.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Trip"} backup ${now.toISOString().slice(0, 10)}.json`;

/** A CSV cell. Quotes when needed, and defuses spreadsheet formulas (a cell starting = + - @ would run in Excel). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The expenses as CSV (UTF-8, comma separated), one row per expense, ready for Splitwise or a spreadsheet. */
export function expensesCsv(d: ExportData): string {
  const t = d.trip;
  const traveler = new Map(d.travelers.map((x) => [x.id, x.name]));
  const category = new Map(d.categories.map((x) => [x.id, x.name]));
  const header = ["Date", "Description", "Category", "Paid by", "Currency", "Amount", `Amount (${t.home_currency})`, "Rate used", "Note"];
  const rows = [...d.expenses]
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.created_at.localeCompare(b.created_at))
    .map((e) => [
      e.spent_on,
      e.description,
      e.category_id ? (category.get(e.category_id) ?? "") : "",
      e.paid_by ? (traveler.get(e.paid_by) ?? "") : "",
      e.currency,
      Number(e.amount),
      Math.round(homeAmount(e, t) * 100) / 100,
      e.currency === t.foreign_currency ? Number(e.rate ?? t.rate) : "",
      e.note ?? "",
    ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
