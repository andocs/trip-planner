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

test("Settle up: the person owed shows their GCash and other details, each with a copy button", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  twoTravelers(fake, { payment: { gcash: "0917 123 4567", maribank: "1234567890", other: "BDO 987" } });
  await fake.install(page);
  await page.goto("/spend");
  await page.getByRole("radio", { name: "Settle up" }).click();
  await expect(page.getByText("0917 123 4567").first()).toBeVisible();
  await expect(page.getByText("MariBank").first()).toBeVisible();
  await expect(page.getByText("BDO 987").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Ana's GCash details" }).first()).toBeVisible();
  await expect(page.getByText("Maya")).toHaveCount(0); // not filled in
  await expect(page.getByRole("link", { name: /^Pay / })).toHaveCount(0); // no outside links at all
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
  await sheet.getByLabel("GCash").fill("call me");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(/GCash number: digits only/)).toBeVisible();
  await sheet.getByLabel("GCash").fill(" 0917 123 4567 ");
  await sheet.getByLabel("QR Ph").fill("Ana S.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.tables.get("travelers")!.find((t) => t.id === "tv-ana")!.payment).toEqual({ gcash: "0917 123 4567", qrph: "Ana S." });
});
