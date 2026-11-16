import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("food menu prices show VND and the PHP equivalent; a sight's details are edited in the shared form", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);

  // The menu lives in the food idea's detail sheet now.
  const food = fake.tables.get("food_places")!.find((f) => f.name === "Bun Cha Ta")!;
  await page.goto(`/places?cat=food&idea=food_places:${food.id}`);
  const sheet = page.getByRole("dialog", { name: "Bun Cha Ta" });
  await expect(sheet.getByRole("region", { name: "Menu prices" })).toBeVisible();
  await expect(sheet.getByText("VND 80,000.00").first()).toBeVisible();
  await expect(sheet.getByText("≈ PHP 196.56").first()).toBeVisible(); // 80,000 × 0.002457

  // Details are edited from "Edit details", in the same form as adding.
  const sight = fake.tables.get("attractions")!.find((a) => a.name === "One Pillar Pagoda")!;
  await page.goto(`/places?cat=sight&idea=attractions:${sight.id}`);
  await page.getByRole("dialog", { name: "One Pillar Pagoda" }).getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit sight" });
  await edit.getByRole("button", { name: "Strenuous" }).click();
  await edit.getByRole("switch", { name: /Deal-breaker/ }).click();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => fake.tables.get("attractions")?.find((a) => a.name === "One Pillar Pagoda")?.deal_breaker)
    .toBe(true);
  expect(fake.tables.get("attractions")!.find((a) => a.name === "One Pillar Pagoda")!.details).toMatchObject({ effort: "strenuous" });
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
