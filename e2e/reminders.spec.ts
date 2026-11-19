import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

// "Today" is 10 Jun 2026 in every test.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

function seedPlan(fake: ReturnType<typeof createFakeSupabase>) {
  const stays = fake.stayRows();
  fake.tables.set("itinerary_items", []); // the seeded workbook has long days; these tests are about stays and tickets
  // One stay that needs attention three ways; the rest are booked and far away, so they say nothing.
  stays.forEach((s) => Object.assign(s, { stay_status: "Booked", check_in: "2026-07-20", check_out: "2026-07-22", details: {} }));
  Object.assign(stays[0], {
    hotel: "Lakeside Inn",
    check_in: "2026-06-11",
    check_out: "2026-06-14",
    details: { cancellation: "free", freeUntil: "2026-06-12" },
  });
  Object.assign(stays[1], { hotel: "Hill Lodge", stay_status: "Planned", check_in: "2026-06-25", check_out: "2026-06-27" });
  const sight = fake.tables.get("attractions")!.find((a) => a.name === "One Pillar Pagoda")!;
  sight.details = { ticketsNeeded: true };
  return { stays };
}

test("owner: Home lists what needs doing, soonest first, and a dismissal sticks", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  seedPlan(fake);
  await fake.install(page);
  await page.goto("/");

  const card = page.getByRole("region", { name: "Reminders" });
  await expect(card.getByText("Check-in tomorrow")).toBeVisible();
  await expect(card.getByText("Free cancellation ends in 2 days")).toBeVisible();
  await expect(card.getByText("Not booked yet")).toBeVisible();
  await expect(card.getByText("Hill Lodge · check-in in 15 days")).toBeVisible();
  await expect(card.getByText("Tickets needed")).toBeVisible();
  await expect(card.getByText("One Pillar Pagoda")).toBeVisible();
  // The owner's own notes from Pack come after the automatic ones.
  const rows = await card.getByRole("listitem").allInnerTexts();
  expect(rows[0]).toContain("Check-in tomorrow");

  await card.getByRole("button", { name: /Dismiss: Check-in tomorrow/ }).click();
  await expect(card.getByText("Check-in tomorrow")).toHaveCount(0);
  await expect(card.getByText("Tickets needed")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Reminders" }).getByText("Check-in tomorrow")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Reminders" }).getByText("Tickets needed")).toBeVisible();
});

test("a reminder opens the place it is about", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  seedPlan(fake);
  await fake.install(page);
  await page.goto("/");
  await page.getByRole("region", { name: "Reminders" }).getByRole("link", { name: /Tickets needed/ }).click();
  await expect(page).toHaveURL(/\/places\?cat=sight&idea=attractions:/);
  await expect(page.getByRole("dialog", { name: "One Pillar Pagoda" })).toBeVisible();
});

test("viewer: sees the reminders too", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  seedPlan(fake);
  await fake.install(page);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Reminders" });
  await expect(card.getByText("Check-in tomorrow")).toBeVisible();
  await expect(card.getByText("Tickets needed")).toBeVisible();
});

test("with nothing to remind about and no notes, the card is not there", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.stayRows().forEach((s) => Object.assign(s, { stay_status: "Booked", check_in: "2026-07-20", check_out: "2026-07-22" }));
  fake.tables.set("reminders", []);
  fake.tables.set("itinerary_items", []);
  await fake.install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Getting ready" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reminders" })).toHaveCount(0);
});

test("Home warns about an upcoming day that is packed, and it opens the itinerary", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const items = fake.tables.get("itinerary_items")!;
  // Trip start is 16 Jun, so Day 2 is 17 Jun (after "today", 10 Jun). Make it 11 hours long.
  const base = items[0];
  fake.tables.set("itinerary_items", [{ ...base, id: "long-1", day: 2, on_date: "2026-06-17", duration_min: 660, kind: "stop", position: 1000, tentative: false }]);
  fake.stayRows().forEach((s) => Object.assign(s, { stay_status: "Booked", check_in: "2026-07-20", check_out: "2026-07-22", details: {} }));
  await fake.install(page);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Reminders" });
  await expect(card.getByText("Day 2 is packed")).toBeVisible();
  await expect(card.getByText("11h planned, over 10h")).toBeVisible();
  await card.getByRole("link", { name: /Day 2 is packed/ }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
});
