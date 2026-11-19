import { expect, test, type Page } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

// "Today" is 5 June, so the forecast reaches 20 June and the seeded itinerary (Day 0 to Day 10, 15 to 25 June) crosses the edge
// in the middle.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-05T09:00:00"));
});

const LAST_FORECAST_DAY = "2026-06-20";
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Answers /api/weather itself, the way the server route would: a forecast up to 20 June, "usually" after. */
async function stubWeather(page: Page, mode: "ok" | "down" = "ok") {
  const calls: URL[] = [];
  await page.route("**/api/weather**", (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    if (mode === "down") return route.fulfill({ status: 502, json: { error: "Weather isn't available right now." } });
    const days = [];
    for (let d = url.searchParams.get("from")!; d <= url.searchParams.get("to")!; d = addDay(d, 1)) {
      const forecast = d <= LAST_FORECAST_DAY;
      days.push({ date: d, code: forecast ? 63 : 1, high: 29.4, low: 24.2, rainChance: forecast ? 80 : null, rainMm: forecast ? null : 6.5, kind: forecast ? "forecast" : "typical" });
    }
    return route.fulfill({ json: { days } });
  });
  return calls;
}

function withCoordinates(fake: ReturnType<typeof createFakeSupabase>) {
  fake.tables.get("destinations")!.forEach((d, i) => Object.assign(d, { lat: 21.0285 + i, lng: 105.8542 + i }));
}

test("each dated day shows its weather: a forecast with the chance of rain, then 'usually' further out", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  withCoordinates(fake);
  await fake.install(page);
  const calls = await stubWeather(page);
  await page.goto("/itinerary");

  const day1 = page.getByRole("separator", { name: /^Day 1 / });
  await expect(day1.getByRole("img", { name: /^Weather: rain, high 29°, low 24°, 80% chance of rain/ })).toBeVisible();
  await expect(day1.getByText("29° / 24°")).toBeVisible();
  await expect(day1.getByText("80% rain")).toBeVisible();

  const day6 = page.getByRole("separator", { name: /^Day 6 / }); // 21 June, the first day past the forecast
  await expect(day6.getByRole("img", { name: /^Weather: Usually partly cloudy, high 29°, low 24°, it rained 6\.5 mm on this date last year/ })).toBeVisible();
  await expect(day6.getByText("usually")).toBeVisible();
  await expect(day6.getByText("80% rain")).toHaveCount(0);

  expect(calls.length).toBeGreaterThan(0);
});

test("our server gets a rounded place, a date range and the trip id (for its membership check); nothing about the person", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("destinations")!.forEach((d, i) => Object.assign(d, { lat: 21.028511 + i, lng: 105.854234 + i }));
  await fake.install(page);
  const calls = await stubWeather(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("img", { name: /^Weather:/ }).first()).toBeVisible();

  for (const u of calls) {
    // The trip id is an opaque id the route checks membership with; route.test.ts proves it never goes on to the weather service.
    expect([...u.searchParams.keys()].sort()).toEqual(["from", "lat", "lng", "to", "trip"]);
    expect(u.searchParams.get("trip")).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.searchParams.get("lat")).toMatch(/^-?\d+(\.\d{1,2})?$/); // about a kilometre
    expect(u.searchParams.get("lng")).toMatch(/^-?\d+(\.\d{1,2})?$/);
    expect(u.pathname).toBe("/api/weather"); // our own server, never the weather service from the browser
  }
});

test("when the weather is unavailable the itinerary looks exactly as before, with no error", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  withCoordinates(fake);
  await fake.install(page);
  await stubWeather(page, "down");
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await expect(page.getByRole("separator", { name: /^Day 1 / })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole("img", { name: /^Weather:/ })).toHaveCount(0);
  await expect(page.getByText(/weather/i)).toHaveCount(0); // no toast, no message
});

test("a trip with no destination coordinates asks for no weather at all", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("destinations")!.forEach((d) => Object.assign(d, { lat: null, lng: null }));
  await fake.install(page);
  const calls = await stubWeather(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls).toHaveLength(0);
  await expect(page.getByRole("img", { name: /^Weather:/ })).toHaveCount(0);
});

test("a viewer sees the weather too", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  withCoordinates(fake);
  await fake.install(page);
  await stubWeather(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("separator", { name: /^Day 1 / }).getByRole("img", { name: /^Weather:/ })).toBeVisible();
});
