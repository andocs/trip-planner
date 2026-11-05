import { describe, expect, it } from "vitest";
import { formatDateRange, formatDateTime, formatDuration, formatMoney, formatTime, initials } from "./format";

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
    expect(formatTime("23:30:00")).toBe("23:30");
    expect(formatDateTime("2026-06-16T22:20:00")).toBe("Tue 16 Jun, 22:20");
  });

  it("formats ranges and initials", () => {
    expect(formatDateRange("2026-06-16", "2026-06-26")).toBe("16 Jun – 26 Jun 2026");
    expect(initials("Aq")).toBe("AQ");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });
});
