import { expect, test, type Request } from "@playwright/test";
import { createFakeSupabase, FAKE_URL } from "./fake-supabase";

/** Anything that asks a server for data: Supabase, or Next for a page / RSC payload. Static assets and map tiles are not. */
const isDataRequest = (r: Request) =>
  r.url().startsWith(FAKE_URL) ||
  (r.url().startsWith("http://localhost") && (r.isNavigationRequest() || "rsc" in r.headers()));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("switching a sub-tab makes no network request and keeps the URL shareable", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/plan");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForLoadState("networkidle"); // hydrated, and the background cache warm-up has finished

  const requests: string[] = [];
  page.on("request", (r) => isDataRequest(r) && requests.push(`${r.method()} ${r.url()}`));

  await page.getByRole("radio", { name: "Flights" }).click();
  await expect(page).toHaveURL(/\/plan\?tab=flights$/);
  await expect(page.getByRole("radio", { name: "Flights" })).toBeChecked();
  await page.getByRole("radio", { name: "Stays" }).click();
  await expect(page).toHaveURL(/\/plan\?tab=stays$/);
  await page.getByRole("radio", { name: "Itinerary" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);

  // The sub-tab survives a reload (deep link).
  await page.goto("/places?tab=attractions");
  await expect(page.getByRole("radio", { name: "Attractions" })).toBeChecked();
});

test("moving between bottom tabs re-uses the loaded data instead of fetching again", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/plan");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForLoadState("networkidle"); // the warm-up has loaded every screen's tables

  const requests: string[] = [];
  page.on("request", (r) => isDataRequest(r) && !("next-router-prefetch" in r.headers()) && requests.push(r.url()));
  // (Next does not prefetch the page you loaded directly, so the test does not return to /plan.)
  const nav = page.getByRole("navigation", { name: "Main" }).last();
  for (const name of ["Spend", "Places", "Pack", "Home", "Spend"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: name === "Home" ? "Vietnam '26" : name })).toBeVisible();
  }
  expect(requests).toEqual([]);
});
