import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("food menu prices show VND and the PHP equivalent; attraction status changes", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");

  await expect(page.getByText("19 food places")).toBeVisible();
  const menuToggle = page.getByRole("button", { name: /^Menu for Bun Cha Ta \(\d+ dishes\)/ });
  await menuToggle.click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("VND 80,000.00").first()).toBeVisible();
  await expect(page.getByText("≈ PHP 196.56").first()).toBeVisible(); // 80,000 × 0.002457

  await page.getByRole("radio", { name: "Attractions" }).click();
  await expect(page).toHaveURL(/tab=attractions/);
  await page.getByRole("button", { name: /One Pillar Pagoda: Planned/ }).click();
  await page.getByRole("menuitem", { name: "Done" }).click();
  await expect
    .poll(() => fake.tables.get("attractions")?.find((a) => a.name === "One Pillar Pagoda")?.status)
    .toBe("Done");
});

test("packing, pasalubong and reminders", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/pack");

  await expect(page.getByText("0 of 40 packed")).toBeVisible();
  const docs = page.getByRole("region", { name: "Important docs" });
  await docs.getByRole("checkbox", { name: "Packed: Passport (Jam)" }).click();
  await expect(page.getByText("1 of 40 packed")).toBeVisible();
  await expect(docs.getByText("1/26")).toBeVisible();

  await page.getByRole("radio", { name: "Pasalubong" }).click();
  await page.getByRole("checkbox", { name: /Bought: Ref magnets/ }).click();
  await expect(page.getByText("1 of 5 bought")).toBeVisible();
  await expect.poll(() => fake.tables.get("gifts")?.find((g) => g.for_whom === "Refrigerator")?.bought).toBe(true);

  await page.getByRole("radio", { name: "Reminders" }).click();
  await page.getByLabel("New reminder").fill("Buy travel insurance");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Buy travel insurance")).toBeVisible();
  expect(fake.tables.get("reminders")).toHaveLength(7);
});
