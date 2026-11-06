import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  // A fixed "today" before the Vietnam trip, so the countdown is deterministic.
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("first visit: create a trip from the empty state", async ({ page }) => {
  const fake = createFakeSupabase();
  await fake.install(page);
  // No trip yet: active_trip returns nothing until create_trip is called.
  let created = false;
  await page.route("**/rest/v1/rpc/active_trip", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(created ? [fake.trip] : []) }),
  );
  await page.route("**/rest/v1/rpc/create_trip", (r) => {
    created = true;
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(fake.trip.id) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where to next?" })).toBeVisible();
  await page.getByRole("button", { name: "Create a trip" }).click();
  await expect(page.getByRole("heading", { name: "My Trip" })).toBeVisible();
});

test("home dashboard shows the seeded trip", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
  await expect(page.getByText("11 days")).toBeVisible();
  await expect(page.locator("#main").getByText("6", { exact: true })).toBeVisible(); // 6 days to go
  await expect(page.locator("#main").getByText("days to go")).toBeVisible();
  await expect(page.getByText("PHP 118,165.00")).toBeVisible();
  await expect(page.getByText("PHP 14,478.08").first()).toBeVisible(); // spent
  await expect(page.getByText("Jam").first()).toBeVisible(); // who owes whom
  await expect(page.getByText("Hanoi").first()).toBeVisible(); // stop list
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

  await expect(page.getByText("Pho tour")).toBeVisible();
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
