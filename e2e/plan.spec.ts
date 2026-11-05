import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("itinerary groups by day, toggles done, and fills the day from the date", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/plan");

  // Seed day numbers are kept as-is (Day 1 = 19 Jun in the workbook).
  await expect(page.getByRole("heading", { name: /^Day 1 · Fri 19 Jun · Sapa/ })).toBeVisible();
  await expect(page.getByText("0 of 140 done")).toBeVisible();

  const done = page.getByRole("checkbox", { name: "Done: Drop off bags @ Ville de Mont" });
  await done.click();
  await expect(done).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("1 of 140 done")).toBeVisible();
  await expect
    .poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Drop off bags @ Ville de Mont")?.done)
    .toBe(true);

  // Add with a date but no day: start is 16 Jun, so 20 Jun → Day 5.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await sheet.getByLabel("Activity").fill("Egg coffee");
  await sheet.getByLabel("Date").fill("2026-06-20");
  await expect(sheet.getByText("Leave blank for Day 5")).toBeVisible();
  await sheet.getByLabel("Time").fill("15:00");
  await sheet.getByRole("button", { name: "Add" }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Egg coffee")?.day).toBe(5);
  // The seed already has a "Day 5" (workbook numbering), so the new item joins that group.
  const day5 = page.getByRole("region", { name: /^Day 5 ·/ });
  await expect(day5.getByRole("button", { name: /15:00 Egg coffee/ })).toBeVisible();
});

test("flights, stays and hotel ideas", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);

  await page.goto("/plan?tab=flights");
  await expect(page.getByText("MNL → HAN")).toBeVisible();
  await expect(page.getByText("Tue 16 Jun, 22:20 → Wed 17 Jun, 00:45")).toBeVisible();
  await page.getByRole("button", { name: /MNL to HAN: Priced/ }).click();
  await page.getByRole("menuitem", { name: "Booked" }).click();
  await expect(page.getByRole("button", { name: /MNL to HAN: Booked/ })).toBeVisible();
  await expect.poll(() => fake.tables.get("flights")?.find((f) => f.from_code === "MNL")?.status).toBe("Booked");
  await expect(page.getByText("Hanoi → Sapa (sleeper bus)")).toBeVisible(); // transfers

  await page.getByRole("radio", { name: "Stays" }).click();
  await expect(page).toHaveURL(/tab=stays/);
  await expect(page.getByText("17 Jun → 19 Jun · 2 nights").first()).toBeVisible();
  await expect(page.getByText("· PHP 10,972.05/night").first()).toBeVisible();

  await page.getByRole("radio", { name: "Ideas" }).click();
  await expect(page.getByText("Hotel de Lagom").first()).toBeVisible();
  await expect(page.getByText("PHP 10,972.05").first()).toBeVisible();
});
