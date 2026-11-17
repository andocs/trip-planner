import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, gmtLabel, instantOf, isValidTimezone, travelMinutes, zoneCity, zoneOrDefault, ZONES } from "./timezones";

describe("timezones", () => {
  it("defaults to the Philippines and rejects unknown zones", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Manila");
    expect(zoneOrDefault(undefined)).toBe("Asia/Manila");
    expect(zoneOrDefault("Mars/Olympus")).toBe("Asia/Manila");
    expect(zoneOrDefault("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(isValidTimezone("Asia/Manila")).toBe(true);
    expect(isValidTimezone("nope")).toBe(false);
  });

  it("every offered zone is a real zone", () => {
    for (const z of ZONES) expect(isValidTimezone(z.id), z.id).toBe(true);
  });

  it("works out the travel time from two local times and their zones", () => {
    // Manila 22:20 -> Hanoi 00:45 the next day: Hanoi is 1 hour behind Manila, so 3h 25m in the air.
    expect(travelMinutes({ local: "2026-06-16T22:20", zone: "Asia/Manila" }, { local: "2026-06-17T00:45", zone: "Asia/Ho_Chi_Minh" })).toBe(205);
    // Manila 09:40 -> Osaka 14:20, Osaka is 1 hour ahead: 3h 40m.
    expect(travelMinutes({ local: "2026-06-18T09:40", zone: "Asia/Manila" }, { local: "2026-06-18T14:20", zone: "Asia/Tokyo" })).toBe(220);
  });

  it("handles the date line and daylight saving", () => {
    // Manila -> Los Angeles lands "before" it left on the clock: 23:00 on the 1st -> 18:00 on the 1st (PDT, 15h behind) = 10h.
    expect(travelMinutes({ local: "2026-07-01T23:00", zone: "Asia/Manila" }, { local: "2026-07-01T18:00", zone: "America/Los_Angeles" })).toBe(10 * 60);
    // In winter LA is 16h behind: the same clock times are 11h.
    expect(travelMinutes({ local: "2026-01-01T23:00", zone: "Asia/Manila" }, { local: "2026-01-01T18:00", zone: "America/Los_Angeles" })).toBe(11 * 60);
  });

  it("is null for missing times, and for results that can't be a flight", () => {
    expect(travelMinutes({ local: null, zone: "Asia/Manila" }, { local: "2026-06-17T00:45", zone: "Asia/Tokyo" })).toBeNull();
    expect(travelMinutes({ local: "2026-06-17T10:00", zone: "Asia/Manila" }, { local: "2026-06-17T09:00", zone: "Asia/Manila" })).toBeNull();
    expect(travelMinutes({ local: "2026-06-01T10:00", zone: "Asia/Manila" }, { local: "2026-06-05T10:00", zone: "Asia/Manila" })).toBeNull();
  });

  it("an unset zone reads as the default", () => {
    expect(travelMinutes({ local: "2026-06-17T10:00", zone: null }, { local: "2026-06-17T12:00", zone: undefined })).toBe(120);
  });

  it("labels offsets", () => {
    expect(gmtLabel("Asia/Manila", "2026-06-16T10:00")).toBe("GMT+8");
    expect(gmtLabel("Asia/Kolkata", "2026-06-16T10:00")).toBe("GMT+5:30");
    expect(gmtLabel("America/New_York", "2026-01-16T10:00")).toBe("GMT-5");
    expect(gmtLabel("America/New_York", "2026-07-16T10:00")).toBe("GMT-4");
  });

  it("names a zone by its city", () => {
    expect(zoneCity("Asia/Tokyo")).toBe("Tokyo / Osaka");
    expect(zoneCity("Asia/Phnom_Penh")).toBe("Phnom Penh");
  });

  it("rejects a malformed timestamp", () => {
    expect(instantOf("tomorrow", "Asia/Manila")).toBeNull();
  });
});

describe("zoneForAirport", () => {
  it("suggests a zone for known codes, any case, and nothing for the rest", async () => {
    const { zoneForAirport } = await import("./timezones");
    expect(zoneForAirport("kix")).toBe("Asia/Tokyo");
    expect(zoneForAirport(" HAN ")).toBe("Asia/Ho_Chi_Minh");
    expect(zoneForAirport("ZZZ")).toBeNull();
    expect(zoneForAirport(null)).toBeNull();
  });
  it("every airport zone is offered in the picker", async () => {
    const { ZONES } = await import("./timezones");
    const ids = new Set(ZONES.map((z) => z.id));
    for (const code of ["MNL", "KIX", "HAN", "LAX", "DPS", "AKL"]) {
      const { zoneForAirport } = await import("./timezones");
      expect(ids.has(zoneForAirport(code)!), code).toBe(true);
    }
  });
});
