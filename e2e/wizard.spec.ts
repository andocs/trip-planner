import { expect, test, type Page } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

/** The owner's setup wizard, end to end against the fake backend. Search, rates and map styles are stubbed. */
const PLACES = {
  hanoi: { lat: 21.0285, lng: 105.8542, label: "Hanoi, Vietnam", name: "Hanoi", country: "Vietnam", countryCode: "VN" },
  sapa: {
    lat: 22.3364,
    lng: 103.8438,
    label: "Sa Pa, Lao Cai, Vietnam",
    name: "Sapa",
    country: "Vietnam",
    countryCode: "VN",
  },
};

async function stubNetwork(page: Page) {
  await page.route("**/api/geocode**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const text = (q.get("q") ?? "").toLowerCase();
    if (q.has("lat")) return route.fulfill({ json: PLACES.hanoi });
    const hit = text.startsWith("sa") ? PLACES.sapa : text.startsWith("ha") ? PLACES.hanoi : null;
    return route.fulfill({ json: { results: hit ? [hit] : [] } });
  });
  await page.route("**/api/rate**", (route) => route.fulfill({ json: { rate: 0.002457, date: "2026-06-10" } }));
  // A blank map style, so the test needs no tile server.
  await page.route("**/tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#cfe6e0" } }],
      },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
  await stubNetwork(page);
});

async function addStop(page: Page, query: string, name: string) {
  await page.getByRole("combobox", { name: "Search for a city or place" }).fill(query);
  await page.getByRole("option", { name }).click();
  await page.getByRole("button", { name: "Add this stop" }).click();
}

test("owner sets up a trip: where, nights, when, who, money, review", async ({ page }) => {
  const fake = createFakeSupabase({ noTrip: true });
  await fake.install(page);
  await page.goto("/");

  // 1 Where
  await expect(page.getByRole("heading", { name: "Where are you going first?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add this stop" })).toBeDisabled();
  await addStop(page, "Hano", "Hanoi");

  // 2 Nights: add a second stop from the same screen, then set nights
  await expect(page.getByRole("heading", { name: "How many nights in each?" })).toBeVisible();
  await page.getByRole("button", { name: "Add another stop on the map" }).click();
  await expect(page.getByRole("heading", { name: "Where next?" })).toBeVisible();
  await addStop(page, "Sap", "Sapa");
  const stops = page.getByRole("list", { name: "Stops" }).getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await page.getByRole("button", { name: "More nights in Hanoi" }).click(); // 2 → 3
  await page.getByRole("button", { name: "Move Sapa up" }).click();
  await expect(stops.first()).toContainText("Sapa");
  await page.getByRole("button", { name: "Continue to dates" }).click();

  // 3 When
  await expect(page.getByRole("heading", { name: "When are you going?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to travelers" })).toBeDisabled();
  await page.getByRole("button", { name: "June 16, 2026" }).click();
  await page.getByRole("button", { name: "June 26, 2026" }).click();
  await expect(page.getByText("11 days · 10 nights")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Your stops cover 5 of 10 nights");
  await page.getByRole("button", { name: "Continue to travelers" }).click();

  // 4 Who
  await expect(page.getByRole("heading", { name: "Who is coming?" })).toBeVisible();
  await expect(page.getByText("Invite link · view only")).toBeVisible();
  await expect(page.getByText("/join/e2e-token")).toBeVisible();
  await page.getByLabel("Add a traveler").fill("Jam");
  await page.getByLabel("Add a traveler").press("Enter");
  await expect(page.getByRole("list", { name: "Travelers" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Continue to money" }).click();

  // 5 Money
  await expect(page.getByRole("heading", { name: "Money basics" })).toBeVisible();
  await page.getByLabel("Trip currency").fill("VND");
  await page.getByRole("button", { name: "Use today’s live rate" }).click();
  await expect(page.getByLabel("Exchange rate")).toHaveValue("0.002457");
  await expect(page.getByRole("status").filter({ hasText: "100,000 VND ≈ PHP 245.70" })).toBeVisible();
  await page.getByLabel(/Total budget/).fill("118165");
  await page.getByRole("button", { name: "Review my trip" }).click();

  // 6 Review
  await expect(page.getByRole("heading", { name: "Ready to go?" })).toBeVisible();
  await expect(page.getByLabel("Trip name")).toHaveValue("Sapa '26");
  await page.getByLabel("Trip name").fill("Vietnam '26");
  await page.getByRole("radio", { name: /Starter checklist/ }).click();
  await page.getByRole("button", { name: "Create my trip" }).click();

  // Lands on Home with the answers carried through
  await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
  await expect(page.getByText("118,165", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(fake.finished).toEqual({ starter: true });
  expect(fake.trip).toMatchObject({
    status: "active",
    foreign_currency: "VND",
    home_currency: "PHP",
    start_date: "2026-06-16",
    end_date: "2026-06-26",
  });
  expect(fake.tables.get("destinations")).toHaveLength(2);
  // A draft was saved after every step
  expect(fake.wizardSaves.map((s) => s.step)).toEqual(expect.arrayContaining([2, 3, 4, 5, 6]));
});

test("a half-finished draft resumes where it stopped, with its stops and travelers", async ({ page }) => {
  await createFakeSupabase({ draftStep: 3 }).install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "When are you going?" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Step 3 of 6" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  const stops = page.getByRole("list", { name: "Stops" }).getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(stops.first()).toContainText("Hanoi");
});

test("a failed save keeps you on the step with a message", async ({ page }) => {
  await createFakeSupabase({ draftStep: 2, failSave: true }).install(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to dates" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /boom|Check your connection/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "How many nights in each?" })).toBeVisible();
});

test("the calendar works from the keyboard", async ({ page }) => {
  await createFakeSupabase({ draftStep: 3 }).install(page);
  await page.goto("/");
  await page.getByRole("button", { name: "June 10, 2026" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "June 18, 2026" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "June 18, 2026" })).toHaveAttribute("aria-pressed", "true");
});

test("viewers see a waiting page while the owner sets up a new trip", async ({ page }) => {
  await createFakeSupabase({ draftStep: 2, role: "viewer" }).install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Almost ready" })).toBeVisible();
  await expect(page.getByText("Where are you going first?")).toHaveCount(0);
});

test("the owner can finish the wizard without the map (no WebGL, offline tiles)", async ({ page }) => {
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
  await createFakeSupabase({ noTrip: true }).install(page);
  await page.goto("/");
  await addStop(page, "Hano", "Hanoi"); // search and the stop list never depend on the map
  await expect(page.getByRole("heading", { name: "How many nights in each?" })).toBeVisible();
});
