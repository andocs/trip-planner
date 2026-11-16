import { expect, test, type Request } from "@playwright/test";
import { createFakeSupabase, FAKE_URL } from "./fake-supabase";

/** Anything that asks a server for data: Supabase, or Next for a page / RSC payload. Static assets and map tiles are not. */
const isDataRequest = (r: Request) =>
  r.url().startsWith(FAKE_URL) ||
  (r.url().startsWith("http://localhost") && (r.isNavigationRequest() || "rsc" in r.headers()));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("switching a Places category makes no network request and keeps the URL shareable", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/places");
  await expect(page.getByRole("heading", { name: "Places" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await page.waitForLoadState("networkidle"); // hydrated, and the background cache warm-up has finished

  const requests: string[] = [];
  page.on("request", (r) => isDataRequest(r) && requests.push(`${r.method()} ${r.url()}`));

  await page.getByRole("button", { name: /^Food/ }).click();
  await expect(page).toHaveURL(/\/places\?cat=food$/);
  await expect(page.getByRole("button", { name: /^Food/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Sights/ }).click();
  await expect(page).toHaveURL(/\/places\?cat=sight$/);
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/places$/);
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);

  // The category survives a reload (deep link).
  await page.goto("/places?cat=stay");
  await expect(page.getByRole("button", { name: /^Stays/ })).toHaveAttribute("aria-pressed", "true");
});

test("old links still land on the right screen", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  for (const [from, to, heading] of [
    ["/plan", /\/itinerary$/, "Itinerary"],
    ["/plan?tab=flights", /\/flights$/, "Flights"],
    ["/plan?tab=stays", /\/stays$/, "Stays"],
    ["/plan?tab=ideas", /\/places\?cat=stay$/, "Places"],
    ["/places?tab=food", /\/places\?cat=food$/, "Places"],
    ["/places?tab=attractions", /\/places\?cat=sight$/, "Places"],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
});

test("moving between bottom tabs re-uses the loaded data instead of fetching again", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForLoadState("networkidle"); // the warm-up has loaded every screen's tables

  const requests: string[] = [];
  page.on("request", (r) => isDataRequest(r) && !("next-router-prefetch" in r.headers()) && requests.push(r.url()));
  // (Next does not prefetch the page you loaded directly, so the test does not return to /itinerary.)
  const nav = page.getByRole("navigation", { name: "Main" }).last();
  for (const name of ["Places", "Stays", "Flights", "Home", "Places"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: name === "Home" ? "Vietnam '26" : name, level: 1 })).toBeVisible();
  }
  expect(requests).toEqual([]);
});

test("More holds Spend, Pack and Settings on a phone", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" }).last();
  await nav.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  for (const name of ["Spend", "Pack", "Settings"]) await expect(more.getByRole("link", { name })).toBeVisible();
  await more.getByRole("link", { name: "Spend" }).click();
  await expect(page.getByRole("heading", { name: "Spend" })).toBeVisible();
  // "More" shows as the current tab while one of its screens is open.
  await expect(nav.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
});
