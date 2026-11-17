import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("owner: stays are photo cards with the price, dates and what is booked", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const stay = fake.tables.get("stays")![0];
  stay.hotel = "Lakeside Inn"; // the seed has several stays called "To be decided"
  Object.assign(stay, { status: "Booked", check_in: "2026-06-11", check_out: "2026-06-14", total: 11400, details: { cancellation: "free", freeUntil: "2026-06-12", breakfast: true } });
  await fake.install(page);
  await page.goto("/stays");

  const card = page.getByRole("article", { name: String(stay.hotel) });
  await expect(card.getByText("11 Jun → 14 Jun · 3 nights")).toBeVisible();
  await expect(card.getByText("PHP 3,800.00")).toBeVisible(); // per night
  await expect(card.getByText("Free cancellation until 12 Jun")).toBeVisible();
  await expect(card.getByText("Check-in tomorrow")).toBeVisible(); // "today" is 10 Jun
  await expect(card.getByText("Breakfast included")).toBeVisible();
  await expect(page.getByText("Nights covered")).toBeVisible();
  await expect(page.getByText("No photo yet").first()).toBeVisible(); // a calm placeholder, never a broken image
});

test("owner: the cancellation terms are saved with the stay", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const stay = fake.tables.get("stays")![0];
  stay.hotel = "Lakeside Inn"; // the seed has several stays called "To be decided"
  await fake.install(page);
  await page.goto("/stays");

  await page.getByRole("button", { name: `Open ${stay.hotel}` }).click();
  await page.getByRole("dialog", { name: String(stay.hotel) }).getByRole("button", { name: "Edit stay" }).click();
  const edit = page.getByRole("dialog", { name: "Edit stay" });
  await edit.getByRole("button", { name: "Free", exact: true }).click();
  await edit.getByLabel("Free until").fill("2026-06-15");
  await edit.getByLabel("Check-in time").fill("14:00");
  await edit.getByRole("switch", { name: /Breakfast included/ }).click();
  await edit.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => fake.tables.get("stays")!.find((s) => s.id === stay.id)?.details)
    .toMatchObject({ cancellation: "free", freeUntil: "2026-06-15", checkInTime: "14:00", breakfast: true }); // plus the idea it is now linked to
  await expect(page.getByRole("article", { name: String(stay.hotel) }).getByText("Free cancellation until 15 Jun")).toBeVisible();
});

test("a stay shows the cover photo of the hotel idea with the same name", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const stay = fake.tables.get("stays")![0];
  stay.hotel = "Lakeside Inn"; // the seed has several stays called "To be decided"
  const idea = fake.tables.get("hotel_ideas")![0];
  idea.hotel = stay.hotel;
  fake.tables.set("item_images", [
    {
      id: "im1",
      trip_id: stay.trip_id,
      item_table: "hotel_ideas",
      item_id: idea.id,
      source: "link",
      url: "https://example.com/room.jpg",
      page_url: null,
      credit: null,
      license: null,
      license_url: null,
      position: 0,
      created_at: new Date().toISOString(),
    },
  ]);
  await fake.install(page);
  await page.goto("/stays");
  await expect(page.getByRole("article", { name: String(stay.hotel) }).getByRole("img", { name: `Photo of ${stay.hotel}` })).toBeAttached();
});

test("viewer: sees the cards and the terms, with no add, no status menu and no confirmation number", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  const stay = fake.tables.get("stays")![0];
  stay.hotel = "Lakeside Inn"; // the seed has several stays called "To be decided"
  Object.assign(stay, { confirmation: "AGD-482913", details: { cancellation: "non-refundable" } });
  await fake.install(page);
  await page.goto("/stays");

  const card = page.getByRole("article", { name: String(stay.hotel) });
  await expect(card.getByText("Non-refundable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /Change status/ })).toHaveCount(0);

  await page.getByRole("button", { name: `Open ${stay.hotel}` }).click();
  const sheet = page.getByRole("dialog", { name: String(stay.hotel) });
  await expect(sheet.getByText("Non-refundable")).toBeVisible();
  await expect(sheet.getByText("AGD-482913")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Edit stay" })).toHaveCount(0);
});
