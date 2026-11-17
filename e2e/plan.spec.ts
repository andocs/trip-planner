import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("itinerary groups by day, toggles done, and asks only for the day", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/itinerary");

  // A day's date is worked out from the trip start (16 Jun), so Day 1 is Tue 16 Jun whatever the old rows say.
  await expect(page.getByRole("separator", { name: /^Day 1 · Tue 16 Jun/ })).toBeVisible();
  await expect(page.getByText("0 of 140 done")).toBeVisible();

  // Done is in the card's menu now.
  await page.getByRole("button", { name: "Drop off bags @ Ville de Mont. Menu" }).click();
  await page.getByRole("menuitem", { name: "Mark complete" }).click();
  await expect(page.getByText("1 of 140 done")).toBeVisible();
  await expect
    .poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Drop off bags @ Ville de Mont")?.done)
    .toBe(true);

  // Adding asks for a day, never a date; the date is saved from the day and the trip start.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await expect(sheet.getByLabel("Date")).toHaveCount(0);
  await sheet.getByLabel("Activity").fill("Egg coffee");
  await sheet.getByRole("button", { name: /^Day 5/ }).click();
  await expect(sheet.getByText("The date follows from the trip start: Sat 20 Jun.")).toBeVisible();
  await sheet.getByLabel("Time").fill("15:00");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Egg coffee")).toBeTruthy();
  const row = fake.tables.get("itinerary_items")!.find((i) => i.activity === "Egg coffee")!;
  expect(row).toMatchObject({ day: 5, on_date: "2026-06-20", at_time: "15:00" });
  expect(typeof row.position).toBe("number");
  await expect(page.getByRole("heading", { name: "Egg coffee" })).toBeVisible();
});

test("flights, stays and hotel ideas (now on Flights, Stays and Places)", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);

  await page.goto("/flights");
  const pass = page.getByRole("article", { name: /^MNL to HAN/ });
  await expect(pass).toBeVisible();
  await expect(pass).toContainText("10:20 PM");
  await expect(pass).toContainText("12:45 AM");
  await page.getByRole("button", { name: /MNL to HAN: Priced/ }).click();
  await page.getByRole("menuitem", { name: "Booked" }).click();
  await expect(page.getByRole("button", { name: /MNL to HAN: Booked/ })).toBeVisible();
  await expect.poll(() => fake.tables.get("flights")?.find((f) => f.from_code === "MNL")?.status).toBe("Booked");
  await expect(page.getByText("Hanoi → Sapa (sleeper bus)")).toBeVisible(); // transfers

  await page.goto("/stays");
  await expect(page.getByText("17 Jun → 19 Jun · 2 nights").first()).toBeVisible();
  await expect(page.getByText("PHP 10,972.05").first()).toBeVisible(); // the nightly price on the card

  // Hotel ideas are the Stays category on Places (confirmed in the seed).
  await page.goto("/places?cat=stay");
  await page.getByRole("radio", { name: /^Confirmed/ }).click();
  await expect(page.getByText("Hotel de Lagom").first()).toBeVisible();
  await expect(page.getByText("PHP 10,972.05").first()).toBeVisible();
});
