import { describe, expect, it } from "vitest";
import {
  arrivalDayOffset,
  formatDuration,
  isIdeaStatus,
  layoverBetween,
  minutesBetween,
  parseDuration,
  withLayovers,
} from "./flights";

const leg = (id: string, from: string | null, to: string | null, departs: string | null, arrives: string | null) => ({
  id,
  from_code: from,
  to_code: to,
  departs_at: departs,
  arrives_at: arrives,
});

describe("durations", () => {
  it("formats minutes the way people say them", () => {
    expect(formatDuration(220)).toBe("3h 40m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(null)).toBe("");
  });
  it("reads what people type", () => {
    for (const [text, min] of [
      ["3h 40m", 220],
      ["3h40m", 220],
      ["3 h 40 m", 220],
      ["3h", 180],
      ["45m", 45],
      ["45 min", 45],
      ["3:40", 220],
      ["220", 220],
      ["  2H  ", 120],
    ] as const)
      expect(parseDuration(text), text).toBe(min);
  });
  it("refuses what it can't read", () => {
    for (const text of ["", "soon", "3h 99x", "-5", "0", "0h", "1:75", "h"])
      expect(parseDuration(text), text).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});

describe("times at the airports", () => {
  it("measures the gap between two clock times, never shifted by this machine's time zone", () => {
    expect(minutesBetween("2026-06-18T09:40", "2026-06-18T12:20")).toBe(160);
    expect(minutesBetween("2026-06-18T23:30", "2026-06-19T01:10")).toBe(100);
    expect(minutesBetween("2026-03-29T01:30", "2026-03-29T03:30")).toBe(120); // across a European clock change: still wall-clock
    expect(minutesBetween(null, "2026-06-18T12:20")).toBeNull();
    expect(minutesBetween("2026-06-18", "2026-06-18T12:20")).toBeNull();
  });
  it("says when you land the next day", () => {
    expect(arrivalDayOffset("2026-06-16T22:20", "2026-06-17T00:45")).toBe(1);
    expect(arrivalDayOffset("2026-06-18T09:40", "2026-06-18T12:20")).toBe(0);
    expect(arrivalDayOffset("2026-06-18T09:40", null)).toBe(0);
  });
});

describe("layovers", () => {
  const a = leg("a", "MNL", "SIN", "2026-06-18T06:15", "2026-06-18T09:50");
  const b = leg("b", "SIN", "HAN", "2026-06-18T12:30", "2026-06-18T15:05");
  it("finds the layover between two flights that connect", () => {
    expect(layoverBetween(a, b)).toEqual({ minutes: 160, airport: "SIN" });
  });
  it("ignores flights that don't connect", () => {
    expect(layoverBetween(a, leg("c", "BKK", "HAN", "2026-06-18T12:30", null))).toBeNull(); // different airport
    expect(layoverBetween(a, leg("d", "SIN", "HAN", "2026-06-20T12:30", null))).toBeNull(); // days later: a separate trip
    expect(layoverBetween(a, leg("e", "SIN", "HAN", "2026-06-18T09:00", null))).toBeNull(); // leaves before it lands
    expect(layoverBetween(leg("x", "MNL", null, null, null), b)).toBeNull();
  });
  it("matches airport codes without regard to case or spaces", () => {
    expect(layoverBetween(leg("a", "MNL", " sin ", null, "2026-06-18T09:50"), b)?.airport).toBe("SIN");
  });
  it("marks each flight with the layover before it", () => {
    const rows = withLayovers([a, b, leg("c", "HAN", "MNL", "2026-06-26T13:30", "2026-06-26T17:10")]);
    expect(rows.map((r) => r.layover?.minutes ?? null)).toEqual([null, 160, null]);
  });
});

describe("status", () => {
  it("draws ideas and maybes as ideas", () => {
    expect(isIdeaStatus("Idea")).toBe(true);
    expect(isIdeaStatus("Maybe")).toBe(true);
    expect(isIdeaStatus("Booked")).toBe(false);
  });
});

describe("flightMinutes", () => {
  const base = { departs_at: "2026-06-18T09:40", arrives_at: "2026-06-18T14:20" };
  it("works the time out from the two zones", async () => {
    const { flightMinutes } = await import("./flights");
    expect(flightMinutes({ ...base, dep_tz: "Asia/Manila", arr_tz: "Asia/Tokyo" })).toBe(220);
  });
  it("prefers the time the owner typed", async () => {
    const { flightMinutes } = await import("./flights");
    expect(flightMinutes({ ...base, duration_min: 230, dep_tz: "Asia/Manila", arr_tz: "Asia/Tokyo" })).toBe(230);
  });
  it("does not guess when a zone is missing (older flights)", async () => {
    const { flightMinutes } = await import("./flights");
    expect(flightMinutes({ ...base, dep_tz: "Asia/Manila", arr_tz: null })).toBeNull();
    expect(flightMinutes({ ...base })).toBeNull();
  });
});
