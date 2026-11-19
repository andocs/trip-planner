import { describe, expect, it } from "vitest";
import {
  addDays,
  cityForDay,
  datesIn,
  describeCode,
  describeDay,
  isIsoDate,
  parseForecast,
  parseTypical,
  planRequests,
  roundCoord,
  sameDayLastYear,
  validCoords,
  windows,
  type City,
  type WeatherDay,
} from "./weather";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    for (const ok of ["2026-06-16", "2028-02-29"]) expect(isIsoDate(ok)).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-06-16", "2026-06-16T10:00", "", null, 20260616]) expect(isIsoDate(bad)).toBe(false);
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("the same date last year; 29 February falls back to 28 February", () => {
    expect(sameDayLastYear("2026-06-16")).toBe("2025-06-16");
    expect(sameDayLastYear("2028-02-29")).toBe("2027-02-28");
    expect(sameDayLastYear("2024-02-29")).toBe("2023-02-28");
    expect(sameDayLastYear("2025-03-01")).toBe("2024-03-01");
  });
  it("lists every date in a window", () => {
    expect(datesIn({ from: "2026-06-30", to: "2026-07-02" })).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});

describe("coordinates", () => {
  it("rounds to about a kilometre and refuses nonsense", () => {
    expect(roundCoord(21.028511)).toBe(21.03);
    expect(roundCoord(-105.8542)).toBe(-105.85);
    expect(validCoords(21.03, 105.85)).toBe(true);
    for (const [a, b] of [[91, 0], [0, 181], [NaN, 0], ["1", 2], [null, 2]] as const) expect(validCoords(a, b)).toBe(false);
  });
});

describe("windows: forecast versus last year's weather", () => {
  const today = "2026-06-10"; // the forecast covers today and the next 15 days, to 25 June
  it("a trip entirely within the forecast reach is all forecast", () => {
    expect(windows("2026-06-12", "2026-06-18", today)).toEqual({ forecast: { from: "2026-06-12", to: "2026-06-18" }, typical: null });
  });
  it("a trip entirely beyond it is all 'usually'", () => {
    expect(windows("2026-08-01", "2026-08-05", today)).toEqual({ forecast: null, typical: { from: "2026-08-01", to: "2026-08-05" } });
  });
  it("a trip that crosses the edge is split with no gap and no overlap", () => {
    const w = windows("2026-06-22", "2026-06-29", today);
    expect(w.forecast).toEqual({ from: "2026-06-22", to: "2026-06-25" });
    expect(w.typical).toEqual({ from: "2026-06-26", to: "2026-06-29" });
  });
  it("days already past get neither; a trip that started is only forecast from today", () => {
    expect(windows("2026-06-01", "2026-06-05", today)).toEqual({ forecast: null, typical: null });
    expect(windows("2026-06-08", "2026-06-12", today).forecast).toEqual({ from: "2026-06-10", to: "2026-06-12" });
  });
  it("the last forecast day is exactly 15 days ahead", () => {
    expect(windows("2026-06-25", "2026-06-26", today)).toEqual({ forecast: { from: "2026-06-25", to: "2026-06-25" }, typical: { from: "2026-06-26", to: "2026-06-26" } });
  });
});

describe("reading the weather service's answers", () => {
  it("reads a forecast", () => {
    const days = parseForecast({ daily: { time: ["2026-06-16", "2026-06-17"], weather_code: [63, 3], temperature_2m_max: [29.4, 30.1], temperature_2m_min: [24.2, 24.9], precipitation_probability_max: [80, 10] } });
    expect(days).toEqual([
      { date: "2026-06-16", code: 63, high: 29.4, low: 24.2, rainChance: 80, rainMm: null, kind: "forecast" },
      { date: "2026-06-17", code: 3, high: 30.1, low: 24.9, rainChance: 10, rainMm: null, kind: "forecast" },
    ]);
  });
  it("skips a day with anything missing or malformed, and never invents one", () => {
    const days = parseForecast({ daily: { time: ["2026-06-16", "bad", "2026-06-18", "2026-06-19"], weather_code: [1, 1, null, 2], temperature_2m_max: [30, 30, 30, "hot"], temperature_2m_min: [20, 20, 20, 20] } });
    expect(days.map((d) => d.date)).toEqual(["2026-06-16"]);
    expect(days[0].rainChance).toBeNull();
  });
  it("copes with junk instead of an answer", () => {
    for (const junk of [null, undefined, "x", 5, [], {}, { daily: null }, { daily: { time: "nope" } }]) expect(parseForecast(junk)).toEqual([]);
  });
  it("reads last year's archive back onto the dates that were asked for", () => {
    const json = { daily: { time: ["2025-06-16", "2025-06-17"], weather_code: [3, 61], temperature_2m_max: [27.3, 26.8], temperature_2m_min: [14.6, 15.3], precipitation_sum: [0, 4.2] } };
    expect(parseTypical(json, ["2026-06-16", "2026-06-17", "2026-06-18"])).toEqual([
      { date: "2026-06-16", code: 3, high: 27.3, low: 14.6, rainChance: null, rainMm: 0, kind: "typical" },
      { date: "2026-06-17", code: 61, high: 26.8, low: 15.3, rainChance: null, rainMm: 4.2, kind: "typical" }, // 18 June has no data: left out
    ]);
  });
  it("a leap day takes 28 February's weather from last year", () => {
    const json = { daily: { time: ["2027-02-28"], weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_sum: [0] } };
    expect(parseTypical(json, ["2028-02-29"])[0]).toMatchObject({ date: "2028-02-29", code: 0 });
  });
});

describe("describeCode / describeDay", () => {
  it("groups WMO codes the way a traveller reads them", () => {
    expect(describeCode(0)).toEqual({ label: "Clear", icon: "sun" });
    expect(describeCode(2).icon).toBe("cloud-sun");
    expect(describeCode(3).icon).toBe("cloud");
    expect(describeCode(45).icon).toBe("fog");
    expect(describeCode(53).icon).toBe("drizzle");
    expect(describeCode(63).icon).toBe("rain");
    expect(describeCode(81)).toEqual({ label: "Rain showers", icon: "rain" });
    expect(describeCode(73).icon).toBe("snow");
    expect(describeCode(95).icon).toBe("storm");
    expect(describeCode(999)).toEqual({ label: "Mixed weather", icon: "cloud" });
  });
  const day = (over: Partial<WeatherDay>): WeatherDay => ({ date: "2026-06-16", code: 63, high: 29.4, low: 24.2, rainChance: 60, rainMm: null, kind: "forecast", ...over });
  it("a forecast reads with its chance of rain", () => {
    expect(describeDay(day({}))).toBe("rain, high 29°, low 24°, 60% chance of rain");
  });
  it("last year's weather says 'usually' and mentions notable rain only", () => {
    expect(describeDay(day({ kind: "typical", rainChance: null, rainMm: 4.2 }))).toBe("Usually rain, high 29°, low 24°, it rained 4.2 mm on this date last year");
    expect(describeDay(day({ kind: "typical", rainChance: null, rainMm: 0.2 }))).toBe("Usually rain, high 29°, low 24°");
    expect(describeDay(day({ kind: "typical", rainChance: null, rainMm: 31.7 }))).toContain("32 mm");
  });
});

describe("which destination a day is in", () => {
  const cities: City[] = [
    { name: "Hanoi", lat: 21.0285, lng: 105.8542 },
    { name: "Da Nang", lat: 16.0544, lng: 108.2022 },
  ];
  it("the destination most of its stops name, ignoring case and spaces", () => {
    expect(cityForDay({ date: "d", cities: [" da nang ", "DA NANG", "Hanoi"] }, cities)?.name).toBe("Da Nang");
  });
  it("falls back to the first destination when no stop names one", () => {
    expect(cityForDay({ date: "d", cities: [null, "Somewhere else"] }, cities)?.name).toBe("Hanoi");
    expect(cityForDay({ date: "d", cities: [] }, cities)?.name).toBe("Hanoi");
  });
  it("is null when the trip has no destination with coordinates", () => {
    expect(cityForDay({ date: "d", cities: ["Hanoi"] }, [])).toBeNull();
  });
});

describe("planRequests", () => {
  const cities: City[] = [
    { name: "Hanoi", lat: 21.0285, lng: 105.8542 },
    { name: "Da Nang", lat: 16.0544, lng: 108.2022 },
  ];
  const today = "2026-06-10";
  const d = (date: string, ...c: string[]) => ({ date, cities: c });

  it("one request per destination, with the place rounded", () => {
    const { requests } = planRequests([d("2026-06-16", "Hanoi"), d("2026-06-17", "Hanoi"), d("2026-06-18", "Da Nang")], cities, today);
    expect(requests).toEqual([
      { lat: 21.03, lng: 105.85, from: "2026-06-16", to: "2026-06-17" },
      { lat: 16.05, lng: 108.2, from: "2026-06-18", to: "2026-06-18" },
    ]);
  });
  it("remembers which destination each date was given", () => {
    const { placeOf } = planRequests([d("2026-06-16", "Hanoi"), d("2026-06-18", "Da Nang")], cities, today);
    expect(placeOf.get("2026-06-16")?.name).toBe("Hanoi");
    expect(placeOf.get("2026-06-18")?.name).toBe("Da Nang");
  });
  it("leaves out past days and days with no date", () => {
    const { requests } = planRequests([d("2026-06-01", "Hanoi"), { date: "", cities: [] }, d("2026-06-12", "Hanoi")], cities, today);
    expect(requests).toEqual([{ lat: 21.03, lng: 105.85, from: "2026-06-12", to: "2026-06-12" }]);
  });
  it("a second visit to the same place later is its own request, not one long span", () => {
    const { requests } = planRequests([d("2026-06-16", "Hanoi"), d("2026-06-17", "Hanoi"), d("2026-06-30", "Hanoi")], cities, today);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ from: "2026-06-30", to: "2026-06-30" });
  });
  it("no request spans more than a month", () => {
    const days = Array.from({ length: 45 }, (_, i) => d(addDays("2026-07-01", i), "Hanoi"));
    for (const r of planRequests(days, cities, today).requests) expect(new Date(r.to).getTime() - new Date(r.from).getTime()).toBeLessThan(31 * 86_400_000);
  });
  it("is empty when no destination has coordinates", () => {
    expect(planRequests([d("2026-06-16", "Hanoi")], [], today).requests).toEqual([]);
  });
});
