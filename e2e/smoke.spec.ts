import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  // A fixed "today" before the Vietnam trip, so the countdown is deterministic.
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("first visit: the owner with no trip lands in the setup wizard", async ({ page }) => {
  const fake = createFakeSupabase({ noTrip: true });
  await fake.install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where are you going first?" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Step 1 of 6" })).toBeVisible();
  expect(fake.trip.status).toBe("draft");
});

test("home dashboard shows the seeded trip", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
  await expect(
    page
      .getByText(/11 days/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.locator("#main").getByText("6", { exact: true }).filter({ visible: true }).first()).toBeVisible(); // 6 days to go
  await expect(page.locator("#main").getByText("days to go").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("118,165", { exact: true })).toBeVisible(); // budget tile
  await expect(page.getByText(/Amounts in PHP/)).toBeVisible();
  await expect(page.getByText("14,478", { exact: true })).toBeVisible(); // spent tile
  await expect(page.getByText("12% used.")).toBeVisible();
  await expect(page.getByText("Jam").filter({ visible: true }).first()).toBeVisible(); // who owes whom
  await expect(page.getByText("Hanoi").filter({ visible: true }).first()).toBeVisible(); // stop list
});

test("add a VND expense and see it converted and split", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/spend");

  await page.getByRole("button", { name: "Add expense" }).click();
  const sheet = page.getByRole("dialog", { name: "Add expense" });
  await sheet.getByRole("radio", { name: "VND" }).click();
  await sheet.getByLabel("Amount").fill("1000000");
  await expect(sheet.getByText("≈ PHP 2,457.00")).toBeVisible();
  await sheet.getByLabel("Description").fill("Pho tour");
  await sheet.getByLabel("Paid by").selectOption({ label: "Aq" });
  await sheet.getByRole("button", { name: "Add expense" }).click();

  await expect(page.getByText("Pho tour").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("PHP 16,935.08").first()).toBeVisible(); // 14,478.08 + 2,457
  expect(fake.tables.get("expenses")?.some((e) => e.description === "Pho tour" && e.currency === "VND")).toBe(true);

  await page.getByRole("radio", { name: "Settle up" }).click();
  // Aq paid 2,457 of 16,935.08 → owes Jam (16,935.08 / 2 − 2,457) = 6,010.54
  await expect(page.getByText("PHP 6,010.54", { exact: true })).toBeVisible(); // the transfer line
  await expect(page.getByText("−PHP 6,010.54")).toBeVisible(); // Aq's balance
});

test("delete offers undo", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/spend");

  await page.getByRole("button", { name: /eSIM unlimited/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: /eSIM unlimited/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /eSIM unlimited/ })).toBeVisible();
  // Undo happened inside the 6s window, so the server never saw a delete.
  await page.waitForTimeout(6500);
  expect(fake.tables.get("expenses")?.some((e) => String(e.description).startsWith("eSIM"))).toBe(true);
});
