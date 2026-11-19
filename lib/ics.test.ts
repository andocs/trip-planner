import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/database.types";
import { buildIcs, fold, type IcsData } from "./ics";

const now = new Date("2026-06-01T00:00:00Z");
const trip = { id: "t", name: "Vietnam '26", start_date: "2026-06-16", timezone: "Asia/Manila" } as Tables<"trips">;
const item = (o: Partial<Tables<"itinerary_items">>) =>
  ({ id: "i1", kind: "stop", activity: "Pho", day: 1, on_date: null, at_time: null, duration_min: null, note: null, city: null, tentative: false, details: {}, ...o }) as Tables<"itinerary_items">;
const flight = (o: Partial<Tables<"flights">> = {}) =>
  ({ id: "f1", airline: "Cebu Pacific", flight_no: "5J 111", from_code: "MNL", to_code: "HAN", departs_at: "2026-06-16T09:40", arrives_at: "2026-06-16T12:40", dep_tz: "Asia/Manila", arr_tz: "Asia/Bangkok", terminal: "3", gate: null, seat: "12A", booking_ref: "SECRET1", has_ref: true, fare: 5000, ...o }) as Tables<"flights">;
const stay = (o: Partial<Tables<"stays">> = {}) =>
  ({ id: "s1", hotel: "Old Quarter Inn", check_in: "2026-06-16", check_out: "2026-06-19", city: "Hanoi", confirmation: "CONF999", total: 9000, ...o }) as Tables<"stays">;
const data = (o: Partial<IcsData>): IcsData => ({ trip, itinerary_items: [], flights: [], stays: [], ...o });
const events = (ics: string) => ics.split("BEGIN:VEVENT").length - 1;

describe("buildIcs", () => {
  it("wraps events in a calendar with CRLF line endings", () => {
    const ics = buildIcs(data({ itinerary_items: [item({})] }), now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain("X-WR-CALNAME:Vietnam '26");
  });

  it("a timed activity is a floating local time on its trip day, with a duration", () => {
    const ics = buildIcs(data({ itinerary_items: [item({ day: 2, at_time: "09:30:00", duration_min: 90 })] }), now);
    expect(ics).toContain("DTSTART:20260617T093000\r\n");
    expect(ics).toContain("DURATION:PT90M");
  });

  it("an untimed activity is an all-day event ending the next day", () => {
    const ics = buildIcs(data({ itinerary_items: [item({ day: 1 })] }), now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260616");
    expect(ics).toContain("DTEND;VALUE=DATE:20260617");
  });

  it("skips connectors and items with no date, and marks tentative ones", () => {
    const ics = buildIcs(
      data({
        itinerary_items: [item({ id: "c", kind: "commute" }), item({ id: "n", day: null, on_date: null }), item({ id: "t", tentative: true })],
      }),
      now,
    );
    expect(events(ics)).toBe(1);
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("escapes commas, semicolons and line breaks", () => {
    const ics = buildIcs(data({ itinerary_items: [item({ activity: "Tea, cake; more", note: "line1\nline2" })] }), now);
    expect(ics).toContain(String.raw`SUMMARY:Tea\, cake\; more`);
    expect(ics).toContain(String.raw`DESCRIPTION:line1\nline2`);
  });

  it("a flight with both zones is real UTC instants", () => {
    const ics = buildIcs(data({ flights: [flight()] }), now);
    expect(ics).toContain("DTSTART:20260616T014000Z"); // 09:40 Manila (UTC+8)
    expect(ics).toContain("DTEND:20260616T054000Z"); // 12:40 Bangkok (UTC+7)
    expect(ics).toContain("SUMMARY:Flight: Cebu Pacific 5J 111 · MNL → HAN");
  });

  it("a flight whose zones are unknown falls back to floating times", () => {
    const ics = buildIcs(data({ flights: [flight({ dep_tz: null, arr_tz: null, from_code: "ZZZ", to_code: "YYY" })] }), now);
    expect(ics).toContain("DTSTART:20260616T094000\r\n");
    expect(ics).toContain("DTEND:20260616T124000\r\n");
  });

  it("a stay is all-day from check-in to check-out", () => {
    const ics = buildIcs(data({ stays: [stay()] }), now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260616");
    expect(ics).toContain("DTEND;VALUE=DATE:20260619");
    expect(ics).toContain("LOCATION:Hanoi");
  });

  it("never includes booking references, confirmation numbers or prices", () => {
    const ics = buildIcs(data({ flights: [flight()], stays: [stay()] }), now);
    for (const secret of ["SECRET1", "CONF999", "9000", "5000"]) expect(ics).not.toContain(secret);
  });

  it("has a stable UID per record so re-importing updates instead of duplicating", () => {
    const a = buildIcs(data({ flights: [flight()] }), now);
    const b = buildIcs(data({ flights: [flight()] }), new Date("2026-07-01T00:00:00Z"));
    expect(a).toContain("UID:flight-f1@trip-planner");
    expect(b).toContain("UID:flight-f1@trip-planner");
  });
});

describe("fold", () => {
  it("leaves short lines alone and folds long ones at 75 octets without splitting a character", () => {
    expect(fold("SHORT")).toBe("SHORT");
    const long = "DESCRIPTION:" + "é".repeat(80);
    const parts = fold(long).split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
  });
});
