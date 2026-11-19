import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

const OTHER = "22222222-2222-4222-8222-222222222222";

// The default test browser is phone-sized; the rail (and its dropdown) exists from the large breakpoint up.
test.use({ viewport: { width: 1280, height: 800 } });

/** A second live trip the person is on, besides the seeded one. */
function withSecondTrip(fake: ReturnType<typeof createFakeSupabase>) {
  fake.extraTrips.push({ ...fake.trip, id: OTHER, name: "Palawan, barkada", start_date: "2026-08-02", end_date: "2026-08-05", status: "active", archived_at: null });
}

test("the trip switcher lists my trips and opens another by its own address, on the same screen", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  withSecondTrip(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  const switcher = page.getByRole("button", { name: "Switch trip" });
  await expect(switcher).toContainText(String(fake.trip.name));
  await switcher.click();
  await expect(page.getByRole("menuitem", { name: new RegExp(String(fake.trip.name)) })).toBeVisible();
  await page.getByRole("menuitem", { name: /Palawan, barkada/ }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${OTHER}/itinerary$`));
  await expect(page.getByRole("button", { name: "Switch trip" })).toContainText("Palawan, barkada");
  // the nav now stays inside that trip
  await page.getByRole("link", { name: "Spend" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/t/${OTHER}/spend$`));
});

test("an address with a trip the person is not on says so, and never offers to set one up", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/t/33333333-3333-4333-8333-333333333333/itinerary");
  await expect(page.getByRole("heading", { name: "That trip isn’t available" })).toBeVisible();
  await expect(page.getByText(/set up/i)).toHaveCount(0);
});

test("New trip adds a trip next to the others and opens its setup; nothing is archived", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Switch trip" }).click();
  await page.getByRole("menuitem", { name: /New trip/ }).click();
  const sheet = page.getByRole("dialog", { name: "New trip" });
  await sheet.getByLabel("Trip name").fill("Hokkaido, winter");
  await sheet.getByRole("button", { name: "Continue to setup" }).click();
  await expect(page).toHaveURL(/\/t\/00000000-0000-4000-8000-000000000001$/);
  expect(fake.extraTrips.map((t) => t.name)).toEqual(["Hokkaido, winter"]);
  expect(fake.trip.archived_at ?? null).toBeNull();
});

test("a link to a bare screen from a card stays inside the open trip", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  withSecondTrip(fake);
  await fake.install(page);
  await page.goto(`/t/${OTHER}`);
  await page.locator('a[href="/pack"]').first().click();
  await expect(page).toHaveURL(new RegExp(`/t/${OTHER}/pack$`));
});

test("opening an invite link when already on a trip asks first, then opens that trip", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto(`/join/${String(fake.trip.join_token)}`);
  await expect(page.getByRole("heading", { name: "Add this trip to your list?" })).toBeVisible();
  await page.getByRole("button", { name: "Add this trip" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${String(fake.trip.id)}$`));
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test("the trip chip on Home opens a sheet with my trips; choosing one opens it", async ({ page }) => {
    const fake = createFakeSupabase({ withSeed: true });
    withSecondTrip(fake);
    await fake.install(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();
    const sheet = page.getByRole("dialog", { name: "Your trips" });
    await expect(sheet.getByRole("button", { name: /New trip/ })).toBeVisible();
    await sheet.getByRole("button", { name: /Palawan, barkada/ }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${OTHER}$`));
  });
});
