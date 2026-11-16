import { describe, expect, it } from "vitest";
import {
  compareByVotes,
  counts,
  displayName,
  ideasFrom,
  MAX_PASTE_LINES,
  onlyConfirmed,
  parseIdeaLines,
  solidStops,
  tally,
} from "./drafts";

describe("only confirmed counts", () => {
  it("counts confirmed and nothing else", () => {
    expect(counts({ decision: "confirmed" })).toBe(true);
    expect(counts({ decision: "draft" })).toBe(false);
    expect(counts({ decision: "dropped" })).toBe(false);
    expect(counts({ decision: "banana" })).toBe(false);
  });
  it("filters rows", () => {
    const rows = [{ decision: "draft" }, { decision: "confirmed" }, { decision: "dropped" }];
    expect(onlyConfirmed(rows)).toEqual([{ decision: "confirmed" }]);
  });
  it("drops tentative stops from totals", () => {
    expect(solidStops([{ tentative: true }, { tentative: false }, {}, { tentative: null }])).toHaveLength(3);
  });
});

describe("ideasFrom", () => {
  const base = { created_at: "2026-06-01T00:00:00Z", trip_id: "t", city: "Hanoi" };
  it("normalizes the three tables", () => {
    const ideas = ideasFrom({
      hotel_ideas: [
        { ...base, id: "h1", hotel: "Old Quarter", room: "Twin", nights: 2, total: 7600, decision: "draft" },
      ],
      food_places: [
        { ...base, id: "f1", name: "Bun cha", day: null, note: null, status: "Idea", price: 300, decision: "draft" },
      ],
      attractions: [
        {
          ...base,
          id: "a1",
          name: "Fansipan",
          day: null,
          note: "Cable car",
          status: "Idea",
          price: null,
          decision: "confirmed",
        },
      ],
    });
    expect(ideas.map((i) => [i.kind, i.name, i.price, i.priceUnit, i.decision])).toEqual([
      ["stay", "Old Quarter", 3800, "night", "draft"],
      ["food", "Bun cha", 300, "person", "draft"],
      ["sight", "Fansipan", null, null, "confirmed"],
    ]);
    expect(ideas[0].key).toBe("hotel_ideas:h1");
  });
  it("shows a stay total when nights are unknown and treats an unknown decision as draft", () => {
    const [i] = ideasFrom({
      hotel_ideas: [{ ...base, id: "h", hotel: "X", room: null, nights: null, total: 5000, decision: "weird" }],
      food_places: [],
      attractions: [],
    });
    expect([i.price, i.priceUnit, i.decision]).toEqual([5000, "total", "draft"]);
  });
});

describe("tally and sorting", () => {
  it("counts each value and ignores junk", () => {
    expect(tally([{ value: "in" }, { value: "in" }, { value: "maybe" }, { value: "pass" }, { value: "??" }])).toEqual({
      in: 2,
      maybe: 1,
      pass: 1,
      total: 4,
    });
  });
  it("sorts by in, then maybe, then fewest pass, then oldest", () => {
    const mk = (i: number, m: number, p: number, at: string) => ({
      tally: { in: i, maybe: m, pass: p, total: i + m + p },
      created_at: at,
    });
    const rows = [mk(1, 0, 0, "b"), mk(3, 0, 0, "c"), mk(1, 2, 0, "d"), mk(1, 0, 2, "a"), mk(1, 0, 0, "a")];
    expect(
      [...rows].sort(compareByVotes).map((r) => `${r.tally.in}${r.tally.maybe}${r.tally.pass}${r.created_at}`),
    ).toEqual(["300c", "120d", "100a", "100b", "102a"]);
  });
});

describe("people", () => {
  it("falls back to Guest", () => {
    expect(displayName("  Tita Rose ")).toBe("Tita Rose");
    expect(displayName("   ")).toBe("Guest");
    expect(displayName(null)).toBe("Guest");
  });
});

describe("parseIdeaLines", () => {
  it("makes one draft per line and reads prices after a dash", () => {
    const { items, skipped } = parseIdeaLines(
      "Old Quarter boutique hotel - 3800\nHmong homestay in Ta Van – PHP 1,900\n\nBún chả Hương Liên\nTrain Street cafe @ 250.50",
    );
    expect(items).toEqual([
      { name: "Old Quarter boutique hotel", price: 3800 },
      { name: "Hmong homestay in Ta Van", price: 1900 },
      { name: "Bún chả Hương Liên", price: null },
      { name: "Train Street cafe", price: 250.5 },
    ]);
    expect(skipped).toBe(0);
  });
  it("strips bullets and numbering", () => {
    expect(parseIdeaLines("- A\n* B\n• C\n1. D\n2) E").items.map((i) => i.name)).toEqual(["A", "B", "C", "D", "E"]);
  });
  it("keeps hyphens inside names and numbers that are part of the name", () => {
    expect(parseIdeaLines("Ta-Van homestay\nHotel 88").items).toEqual([
      { name: "Ta-Van homestay", price: null },
      { name: "Hotel 88", price: null },
    ]);
  });
  it("drops repeated names and caps a runaway paste", () => {
    expect(parseIdeaLines("A\na\nB").items.map((i) => i.name)).toEqual(["A", "B"]);
    const many = Array.from({ length: MAX_PASTE_LINES + 5 }, (_, i) => `Place ${i}`).join("\n");
    const r = parseIdeaLines(many);
    expect(r.items).toHaveLength(MAX_PASTE_LINES);
    expect(r.skipped).toBe(5);
  });
  it("handles Windows line endings and empty input", () => {
    expect(parseIdeaLines("A\r\nB\r\n").items).toHaveLength(2);
    expect(parseIdeaLines("  \n \n").items).toEqual([]);
  });
});
