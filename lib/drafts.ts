import { counts, onlyConfirmed, pricePerNight, solidStops } from "./calc";
import type { Tables } from "./database.types";

/**
 * Scratch-first model. Everything the owner types starts as a draft; only `confirmed` items count toward
 * budget, counters and exports. Pure functions only (no React, no network) so the rules are easy to test.
 */
export type Decision = "draft" | "confirmed" | "dropped";
export type IdeaTable = "hotel_ideas" | "food_places" | "attractions";
export type VoteValue = "in" | "maybe" | "pass";
export type IdeaKind = "stay" | "food" | "sight";

export const IDEA_TABLES: IdeaTable[] = ["hotel_ideas", "food_places", "attractions"];
export const TABLE_OF_KIND: Record<IdeaKind, IdeaTable> = {
  stay: "hotel_ideas",
  food: "food_places",
  sight: "attractions",
};
export const KIND_OF_TABLE: Record<IdeaTable, IdeaKind> = {
  hotel_ideas: "stay",
  food_places: "food",
  attractions: "sight",
};
export const KIND_LABEL: Record<IdeaKind, string> = { stay: "Stay", food: "Food", sight: "Sight" };
export const VOTE_LABEL: Record<VoteValue, string> = { in: "I’m in", maybe: "Maybe", pass: "Pass" };

export const isDecision = (v: unknown): v is Decision => v === "draft" || v === "confirmed" || v === "dropped";
export const isIdeaTable = (v: unknown): v is IdeaTable => IDEA_TABLES.includes(v as IdeaTable);

export { counts, onlyConfirmed, solidStops };

/** Decision a legacy status implies. Used by the seed and by the proposed backfill (supabase/proposals). */
export function decisionForStatus(status: string | null | undefined): Decision {
  if (status === "Idea" || status === "Maybe") return "draft";
  if (status === "Cancelled") return "dropped";
  return "confirmed";
}

/* ---------- one card shape for the three tables ---------- */

export type Idea = {
  table: IdeaTable;
  id: string;
  /** `${table}:${id}`: unique across tables, used for votes/comments lookups and URLs. */
  key: string;
  kind: IdeaKind;
  name: string;
  city: string | null;
  price: number | null;
  priceUnit: "night" | "person" | "total" | null;
  decision: Decision;
  note: string | null;
  /** Stays only: nights and the total price they were saved with. */
  nights: number | null;
  total: number | null;
  /** Category fields (see lib/idea-details.ts) and the owner's must-do flag. */
  details: unknown;
  dealBreaker: boolean;
  created_at: string;
};

const decisionOf = (v: string): Decision => (isDecision(v) ? v : "draft");
/** Whatever can hold photos: an idea, or an activity added by hand on the itinerary. */
export type PhotoTable = IdeaTable | "itinerary_items";
export type PhotoOwner = { table: PhotoTable; id: string; key: string; name: string };
export const ideaKey = (table: PhotoTable, id: string) => `${table}:${id}`;

export function ideasFrom(d: {
  hotel_ideas: Tables<"hotel_ideas">[];
  food_places: Tables<"food_places">[];
  attractions: Tables<"attractions">[];
}): Idea[] {
  const stays: Idea[] = d.hotel_ideas.map((h) => {
    const ppn = pricePerNight(h.total, h.nights);
    return {
      table: "hotel_ideas",
      id: h.id,
      key: ideaKey("hotel_ideas", h.id),
      kind: "stay",
      name: h.hotel,
      city: h.city,
      price: ppn ?? (h.total === null || h.total === undefined ? null : Number(h.total)),
      priceUnit: ppn !== null ? "night" : h.total === null || h.total === undefined ? null : "total",
      decision: decisionOf(h.decision),
      note: h.room,
      nights: h.nights === null || h.nights === undefined ? null : Number(h.nights),
      total: h.total === null || h.total === undefined ? null : Number(h.total),
      details: h.details,
      dealBreaker: h.deal_breaker === true,
      created_at: h.created_at,
    };
  });
  const place = (
    table: "food_places" | "attractions",
    rows: Tables<"food_places">[] | Tables<"attractions">[],
  ): Idea[] =>
    rows.map((r) => {
      const hasPrice = r.price !== null && r.price !== undefined;
      return {
        table,
        id: r.id,
        key: ideaKey(table, r.id),
        kind: KIND_OF_TABLE[table],
        name: r.name,
        city: r.city,
        price: hasPrice ? Number(r.price) : null,
        priceUnit: hasPrice ? "person" : null,
        decision: decisionOf(r.decision),
        note: r.note,
        nights: null,
        total: null,
        details: r.details,
        dealBreaker: r.deal_breaker === true,
        created_at: r.created_at,
      };
    });
  return [...stays, ...place("food_places", d.food_places), ...place("attractions", d.attractions)];
}

/* ---------- votes ---------- */

export type Tally = { in: number; maybe: number; pass: number; total: number };

export function tally(votes: { value: string }[]): Tally {
  const t: Tally = { in: 0, maybe: 0, pass: 0, total: 0 };
  for (const v of votes) {
    if (v.value === "in" || v.value === "maybe" || v.value === "pass") {
      t[v.value]++;
      t.total++;
    }
  }
  return t;
}

/** Most "in" first, then most "maybe", then fewest "pass"; ties keep the order they were added. */
export function compareByVotes(
  a: { tally: Tally; created_at: string },
  b: { tally: Tally; created_at: string },
): number {
  return (
    b.tally.in - a.tally.in ||
    b.tally.maybe - a.tally.maybe ||
    a.tally.pass - b.tally.pass ||
    a.created_at.localeCompare(b.created_at)
  );
}

/* ---------- people ---------- */

export const displayName = (label: string | null | undefined): string => label?.trim() || "Guest";

/* ---------- paste several ---------- */

export const MAX_PASTE_LINES = 100;
export const MAX_NAME = 200;
export type ParsedIdea = { name: string; price: number | null };

// "Sky Hotel - 3800", "Sky Hotel – PHP 3,800", "Sky Hotel @ 3800". Needs spaces around the separator so "Ta-Van" survives.
const PRICE_TAIL = /^(.*\S)\s+(?:-|–|—|@)\s+(?:php\s*|₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*$/i;
const BULLET = /^\s*(?:[-*•·]|\d{1,3}[.)])\s+/;

/**
 * One draft per non-empty line. Strips bullets and numbering, reads an optional price after a dash,
 * drops repeated names, and caps the batch so a stray paste cannot create hundreds of rows.
 */
export function parseIdeaLines(text: string): { items: ParsedIdea[]; skipped: number } {
  const items: ParsedIdea[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(BULLET, "").trim();
    if (!line) continue;
    let price: number | null = null;
    const m = PRICE_TAIL.exec(line);
    if (m) {
      line = m[1].trim();
      price = Number(m[2].replace(/,/g, ""));
      if (!Number.isFinite(price)) price = null;
    }
    const name = line.slice(0, MAX_NAME).trim();
    const k = name.toLowerCase();
    if (!name || seen.has(k)) {
      skipped++;
      continue;
    }
    if (items.length >= MAX_PASTE_LINES) {
      skipped++;
      continue;
    }
    seen.add(k);
    items.push({ name, price });
  }
  return { items, skipped };
}
