import { describe, expect, it } from "vitest";
import {
  currencyOptions,
  defaultTripName,
  destinationFor,
  mapRegionFor,
  monthWeeks,
  nightsHint,
  pickRange,
  ratePreview,
  totalNights,
} from "./wizard";

describe("nights hint", () => {
  const stops = [{ nights: 3 }, { nights: 2 }, { nights: 2 }];
  it("is quiet when stops match the trip length", () => {
    expect(nightsHint([{ nights: 10 }], "2026-06-16", "2026-06-26")).toBeNull();
  });
  it("explains a shortfall without blocking", () => {
    expect(nightsHint(stops, "2026-06-16", "2026-06-26")).toBe(
      "Your stops cover 7 of 10 nights. Extra nights are fine for travel days.",
    );
  });
  it("flags too many nights", () => {
    expect(nightsHint([{ nights: 12 }], "2026-06-16", "2026-06-26")).toMatch(/12 nights, but the trip is 10/);
  });
  it("says nothing without dates or stops", () => {
    expect(nightsHint(stops, null, null)).toBeNull();
    expect(nightsHint([], "2026-06-16", "2026-06-26")).toBeNull();
  });
  it("adds up nights", () => expect(totalNights(stops)).toBe(7));
});

describe("trip name and region", () => {
  it("uses the first stop and the start year", () => {
    expect(defaultTripName([{ name: "Hanoi" }, { name: "Sapa" }], "2026-06-16")).toBe("Hanoi '26");
  });
  it("falls back to today's year, then to My Trip", () => {
    expect(defaultTripName([{ name: "Kyoto" }], null, "2027-01-05")).toBe("Kyoto '27");
    expect(defaultTripName([], "2026-06-16")).toBe("My Trip");
  });
  it("picks a country region only when every stop shares one", () => {
    expect(mapRegionFor([{ countryCode: "vn" }, { countryCode: "VN" }])).toBe("VN");
    expect(mapRegionFor([{ countryCode: "VN" }, { countryCode: "TH" }])).toBe("world");
    expect(mapRegionFor([{ countryCode: null }])).toBe("world");
  });
  it("names the destination by country, or by the first stop across borders", () => {
    expect(
      destinationFor([
        { name: "Hanoi", country: "Vietnam" },
        { name: "Sapa", country: "Vietnam" },
      ]),
    ).toBe("Vietnam");
    expect(
      destinationFor([
        { name: "Hanoi", country: "Vietnam" },
        { name: "Bangkok", country: "Thailand" },
      ]),
    ).toBe("Hanoi");
  });
});

describe("range calendar", () => {
  it("first tap sets the start, the next later tap the end", () => {
    expect(pickRange(null, null, "2026-06-16")).toEqual({ start: "2026-06-16", end: null });
    expect(pickRange("2026-06-16", null, "2026-06-26")).toEqual({ start: "2026-06-16", end: "2026-06-26" });
  });
  it("an earlier second tap moves the start; a tap after a full range starts over", () => {
    expect(pickRange("2026-06-16", null, "2026-06-10")).toEqual({ start: "2026-06-10", end: null });
    expect(pickRange("2026-06-16", "2026-06-26", "2026-07-01")).toEqual({ start: "2026-07-01", end: null });
  });
  it("lays out June 2026 Monday-first (June 1 is a Monday)", () => {
    const weeks = monthWeeks(2026, 5);
    expect(weeks[0][0]).toBe("2026-06-01");
    expect(weeks.at(-1)!.filter(Boolean).at(-1)).toBe("2026-06-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("pads a month that starts mid-week", () => {
    const weeks = monthWeeks(2026, 7); // Aug 1 2026 is a Saturday
    expect(weeks[0].slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(weeks[0][5]).toBe("2026-08-01");
  });
});

describe("money step", () => {
  it("previews 100,000 of the trip currency in home money", () => {
    expect(ratePreview(0.002457, "VND", "PHP")).toBe("100,000 VND ≈ PHP 245.70");
  });
  it("shows nothing for a bad rate or currency", () => {
    expect(ratePreview(0, "VND", "PHP")).toBeNull();
    expect(ratePreview(1, "vnd", "PHP")).toBeNull();
  });
  it("lists ISO currencies with names", () => {
    const list = currencyOptions();
    expect(list.find((c) => c.code === "PHP")?.name).toMatch(/peso/i);
    expect(list.length).toBeGreaterThan(10);
  });
});
