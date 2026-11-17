import { describe, expect, it } from "vitest";
import { formatDateRange, formatDateTime, formatDuration, formatMoney, formatTime, initials, timeRange } from "./format";

describe("format", () => {
  it("formats money with the ISO code", () => {
    expect(formatMoney(1234, "PHP")).toBe("PHP 1,234.00");
    expect(formatMoney(-656.02, "PHP")).toBe("−PHP 656.02");
    expect(formatMoney("80000", "VND")).toBe("VND 80,000.00");
  });

  it("formats durations, times and local timestamps", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(null)).toBe("");
    expect(formatTime("23:30:00")).toBe("11:30 PM");
    expect(formatTime("13:00")).toBe("1:00 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(timeRange("13:00", 120)).toBe("1:00 PM - 3:00 PM");
    expect(timeRange("23:30", 60)).toBe("11:30 PM - 12:30 AM");
    expect(timeRange("09:00", null)).toBe("9:00 AM");
    expect(timeRange(null, 60)).toBe("");
    expect(formatDateTime("2026-06-16T22:20:00")).toBe("Tue 16 Jun, 10:20 PM");
  });

  it("formats ranges and initials", () => {
    expect(formatDateRange("2026-06-16", "2026-06-26")).toBe("16 Jun – 26 Jun 2026");
    expect(initials("Aq")).toBe("AQ");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });
});
