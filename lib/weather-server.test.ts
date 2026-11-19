import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createCache, createLimiter } from "./rate-limit";
import { WeatherError, weatherFor, type WeatherDeps } from "./weather-server";

const forecastJson = { daily: { time: ["2026-06-16", "2026-06-17"], weather_code: [63, 3], temperature_2m_max: [29, 30], temperature_2m_min: [24, 25], precipitation_probability_max: [70, 10] } };
const archiveJson = { daily: { time: ["2025-07-01", "2025-07-02"], weather_code: [1, 61], temperature_2m_max: [31, 28], temperature_2m_min: [25, 24], precipitation_sum: [0, 8] } };

/** A fake Open-Meteo: records every URL and answers by host. */
function fake(opts: { forecast?: "ok" | "fail" | "throw"; archive?: "ok" | "fail" | "throw" } = {}) {
  const urls: string[] = [];
  const deps: WeatherDeps = {
    today: "2026-06-10",
    fetch: vi.fn(async (input: string | URL | Request) => {
      const u = String(input);
      urls.push(u);
      const mode = u.includes("archive-api") ? (opts.archive ?? "ok") : (opts.forecast ?? "ok");
      if (mode === "throw") throw new Error("network");
      if (mode === "fail") return new Response("{}", { status: 500 });
      return Response.json(u.includes("archive-api") ? archiveJson : forecastJson);
    }) as unknown as typeof fetch,
  };
  return { deps, urls };
}

describe("weatherFor", () => {
  it("a trip inside the forecast reach makes one forecast call and nothing else", async () => {
    const { deps, urls } = fake();
    const days = await weatherFor({ lat: 21.03, lng: 105.85, from: "2026-06-16", to: "2026-06-17" }, deps);
    expect(urls).toHaveLength(1);
    expect(days.map((d) => [d.date, d.kind])).toEqual([["2026-06-16", "forecast"], ["2026-06-17", "forecast"]]);
  });

  it("a trip far ahead asks the archive for the same dates a year earlier, and labels the answer with the real dates", async () => {
    const { deps, urls } = fake();
    const days = await weatherFor({ lat: 21.03, lng: 105.85, from: "2026-07-01", to: "2026-07-02" }, deps);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("archive-api.open-meteo.com");
    expect(urls[0]).toContain("start_date=2025-07-01");
    expect(urls[0]).toContain("end_date=2025-07-02");
    expect(days.map((d) => [d.date, d.kind, d.rainMm])).toEqual([["2026-07-01", "typical", 0], ["2026-07-02", "typical", 8]]);
  });

  it("a trip across the edge makes both calls and returns the days in order", async () => {
    const { deps, urls } = fake();
    const days = await weatherFor({ lat: 1, lng: 2, from: "2026-06-25", to: "2026-07-02" }, deps);
    expect(urls).toHaveLength(2);
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
  });

  it("sends only the place, the dates and the fields it needs: nothing about the trip or the person", async () => {
    const { deps, urls } = fake();
    await weatherFor({ lat: 21.03, lng: 105.85, from: "2026-06-16", to: "2026-06-17" }, deps);
    const u = new URL(urls[0]);
    expect([...u.searchParams.keys()].sort()).toEqual(["daily", "end_date", "latitude", "longitude", "start_date", "timezone"]);
    expect(u.searchParams.get("latitude")).toBe("21.03");
    const init = (deps.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(Object.keys(init.headers as object)).toEqual(["Accept"]); // no cookies, no user agent with contact details
    expect(init.credentials).toBeUndefined();
  });

  it("past days are not asked for at all", async () => {
    const { deps, urls } = fake();
    expect(await weatherFor({ lat: 1, lng: 2, from: "2026-06-01", to: "2026-06-05" }, deps)).toEqual([]);
    expect(urls).toHaveLength(0);
  });

  it("if one service fails the other still answers; if both fail it is a plain WeatherError", async () => {
    const half = fake({ forecast: "fail" });
    const days = await weatherFor({ lat: 1, lng: 2, from: "2026-06-25", to: "2026-07-02" }, half.deps);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.kind === "typical")).toBe(true);
    await expect(weatherFor({ lat: 1, lng: 2, from: "2026-06-16", to: "2026-06-17" }, fake({ forecast: "throw" }).deps)).rejects.toThrow(WeatherError);
    await expect(weatherFor({ lat: 1, lng: 2, from: "2026-06-25", to: "2026-07-02" }, fake({ forecast: "fail", archive: "fail" }).deps)).rejects.toThrow(WeatherError);
  });

  it("refuses a place that is not a place", async () => {
    await expect(weatherFor({ lat: 999, lng: 0, from: "2026-06-16", to: "2026-06-17" }, fake().deps)).rejects.toThrow(WeatherError);
  });
});

describe("createLimiter", () => {
  it("allows a number of calls a minute per key, then refuses, then recovers", () => {
    const allow = createLimiter(3);
    expect([allow("a", 0), allow("a", 1), allow("a", 2), allow("a", 3)]).toEqual([true, true, true, false]);
    expect(allow("b", 3)).toBe(true); // another key is separate
    expect(allow("a", 60_001)).toBe(true); // a minute later the first calls have aged out
  });
  it("forgets old keys so the map cannot grow without bound", () => {
    const allow = createLimiter(1, 3);
    for (let i = 0; i < 10; i++) allow(`k${i}`, i);
    expect(allow("fresh", 200_000)).toBe(true);
  });
});

describe("createCache", () => {
  it("returns a value until it expires and caps its size, oldest first", () => {
    const c = createCache<number>(1000, 2);
    c.set("a", 1, 0);
    expect(c.get("a", 500)).toBe(1);
    expect(c.get("a", 1500)).toBeUndefined();
    c.set("x", 1, 0);
    c.set("y", 2, 0);
    c.set("z", 3, 0);
    expect(c.size).toBe(2);
    expect(c.get("x", 1)).toBeUndefined();
    expect(c.get("z", 1)).toBe(3);
  });
});
