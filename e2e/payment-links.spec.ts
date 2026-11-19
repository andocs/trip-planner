import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

function twoTravelers(fake: ReturnType<typeof createFakeSupabase>, ana: Record<string, unknown> = {}) {
  const tripId = fake.tables.get("travelers")![0].trip_id;
  fake.tables.set("travelers", [
    { id: "tv-ana", trip_id: tripId, name: "Ana", sort: 0, created_at: "2026-06-01T00:00:00Z", ...ana },
    { id: "tv-ben", trip_id: tripId, name: "Ben", sort: 1, created_at: "2026-06-01T00:00:00Z" },
  ]);
  fake.tables.set("expenses", [
    { id: "e1", trip_id: tripId, spent_on: "2026-06-16", description: "Hotel", amount: 1000, currency: "PHP", category_id: null, paid_by: "tv-ana", note: null, created_at: "2026-06-16T00:00:00Z", source_table: null, source_id: null, split: null },
  ]);
}

test("Settle up: the person owed gets pay links with the amount filled in, and details to copy", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  twoTravelers(fake, { payment: { paypal: "ana-d", other: "GCash 0917 123 4567" } });
  await fake.install(page);
  await page.goto("/spend");
  await page.getByRole("radio", { name: "Settle up" }).click();
  const link = page.getByRole("link", { name: "Pay Ana with PayPal" }).first();
  await expect(link).toHaveAttribute("href", /^https:\/\/paypal\.me\/ana-d\/500\.00PHP$/i);
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(page.getByText("GCash 0917 123 4567").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Venmo/ })).toHaveCount(0); // dollars only
});

test("Settle up: a traveler with no payment details shows no pay row", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  twoTravelers(fake);
  await fake.install(page);
  await page.goto("/spend");
  await page.getByRole("radio", { name: "Settle up" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ben" }).filter({ hasText: "Ana" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Pay / })).toHaveCount(0);
});

test("Settings: payment details are saved on the traveler, and a bad handle is refused", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  twoTravelers(fake);
  await fake.install(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Edit Ana" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit traveler" });
  await sheet.getByLabel("PayPal.Me name").fill("bad name!");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(/PayPal.Me name: letters/)).toBeVisible();
  await sheet.getByLabel("PayPal.Me name").fill("https://paypal.me/ana-d/5");
  await sheet.getByLabel("Anything else").fill("GCash 0917");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.tables.get("travelers")!.find((t) => t.id === "tv-ana")!.payment).toEqual({ paypal: "ana-d", other: "GCash 0917" });
});
