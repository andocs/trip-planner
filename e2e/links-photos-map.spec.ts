import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

/** Day 1 has two timed stops, Day 2 one. Trip start is 16 Jun. */
function plan(fake: ReturnType<typeof createFakeSupabase>, details: Record<string, unknown> = {}) {
  const tripId = fake.tables.get("itinerary_items")![0].trip_id;
  const row = (activity: string, day: number, position: number, at_time: string | null) => ({
    id: `t-${activity.replace(/\W+/g, "-").toLowerCase()}`,
    trip_id: tripId,
    day,
    on_date: `2026-06-${15 + day}`,
    city: "Osaka",
    at_time,
    activity,
    type: "Sightseeing",
    duration_min: 60,
    note: null,
    done: false,
    created_at: "2026-06-01T00:00:00Z",
    source_table: null,
    source_id: null,
    tentative: false,
    position,
    kind: "stop",
    details,
  });
  fake.tables.set("itinerary_items", [row("Osaka Castle", 1, 1000, "09:00"), row("Dotonbori dinner", 1, 2000, "18:30"), row("Nara day trip", 2, 1000, null)]);
}

test("a day's activities show as pills with their times; not on All days; picking one opens a card with its links", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake, { website: "https://example.com/castle", mapsUrl: "https://maps.app.goo.gl/abc123" });
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("heading", { name: "Osaka Castle" })).toBeVisible();
  await expect(page.getByRole("group", { name: /^Activities on day/ })).toHaveCount(0); // All days: none

  await page.getByRole("group", { name: "Show days" }).getByRole("button", { name: "Day 1", exact: true }).click();
  const pills = page.getByRole("group", { name: "Activities on day 1" });
  await expect(pills.getByRole("button")).toHaveCount(2);
  await expect(pills.getByRole("button", { name: /Osaka Castle/ })).toBeVisible();
  await expect(pills.getByRole("button", { name: /Dotonbori dinner/ })).toBeVisible();

  await pills.getByRole("button", { name: /Osaka Castle/ }).click();
  const card = page.getByRole("complementary", { name: /Osaka Castle, selected stop/ });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://example.com/castle");
  await expect(card.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", "https://maps.app.goo.gl/abc123");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);

  await page.getByRole("group", { name: "Show days" }).getByRole("button", { name: "All days" }).click();
  await expect(page.getByRole("group", { name: /^Activities on day/ })).toHaveCount(0);
});

test("owner: an activity takes a website and a Google Maps link, saved with it, and they can be edited", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await sheet.getByLabel("Activity").fill("Umeda Sky Building");
  await sheet.getByLabel("Website").fill("https://example.com/umeda");
  await sheet.getByLabel("Google Maps link").fill("https://example.com/not-maps");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByText(/Use a Google Maps link/)).toBeVisible();
  await sheet.getByLabel("Google Maps link").fill("https://maps.app.goo.gl/umeda");
  await expect(sheet.getByRole("region", { name: "Photos" })).toBeVisible();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Umeda Sky Building")).toBeTruthy();
  const saved = fake.tables.get("itinerary_items")!.find((i) => i.activity === "Umeda Sky Building")!;
  expect(saved.details).toMatchObject({ website: "https://example.com/umeda", mapsUrl: "https://maps.app.goo.gl/umeda" });

  // Edit: the saved links are there, and changing one is saved without losing the other.
  await page.getByRole("button", { name: "Open Umeda Sky Building" }).click();
  const edit = page.getByRole("dialog", { name: "Edit activity" });
  await expect(edit.getByLabel("Website")).toHaveValue("https://example.com/umeda");
  await expect(edit.getByLabel("Google Maps link")).toHaveValue("https://maps.app.goo.gl/umeda");
  await edit.getByLabel("Website").fill("https://example.com/umeda-2");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => (fake.tables.get("itinerary_items")!.find((i) => i.activity === "Umeda Sky Building")!.details as Record<string, string>).website)
    .toBe("https://example.com/umeda-2");
  expect(fake.tables.get("itinerary_items")!.find((i) => i.activity === "Umeda Sky Building")!.details).toMatchObject({ mapsUrl: "https://maps.app.goo.gl/umeda" });
});

test("owner: a place on the board takes a website and a Google Maps link and shows them when opened", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add place" });
  await sheet.getByLabel("Name").fill("Kuromon Market");
  await sheet.getByLabel("Website").fill("https://example.com/kuromon");
  await sheet.getByLabel("Google Maps link").fill("https://www.google.com/maps/place/Kuromon");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  const find = () => ["hotel_ideas", "food_places", "attractions"].flatMap((t) => fake.tables.get(t)!).find((r) => (r.name ?? r.hotel) === "Kuromon Market");
  await expect.poll(find).toBeTruthy();
  const row = find()!;
  expect(row.details).toMatchObject({ website: "https://example.com/kuromon", mapsUrl: "https://www.google.com/maps/place/Kuromon" });
});

test("Find photo inside Edit activity keeps the activity sheet open", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Open Osaka Castle" }).click();
  const edit = page.getByRole("dialog", { name: "Edit activity" });
  await edit.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByLabel("Page or picture link").fill("https://192.168.1.20/rooms/201");
  await add.getByRole("button", { name: "Find photo" }).click();
  await expect(add.getByText(/./).first()).toBeVisible();
  await page.waitForTimeout(800); // a wrongly submitted activity form would close its sheet about now
  // While the photo sheet is on top the activity sheet is hidden from the accessibility tree, but it must still be there.
  await expect(page.getByRole("dialog", { name: "Edit activity", includeHidden: true })).toHaveCount(1);
  await expect(add).toBeVisible();
});

test("times read as 1:00 PM, activity pills show a range under the name, day headers have no place count", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("separator", { name: /^Day 1 ·/ }).locator("..").getByText(/places?/)).toHaveCount(0);
  await page.getByRole("group", { name: "Show days" }).getByRole("button", { name: "Day 1", exact: true }).click();
  const pills = page.getByRole("group", { name: "Activities on day 1" });
  await expect(pills.getByRole("button", { name: /Osaka Castle/ })).toContainText("9:00 AM - 10:00 AM");
  await expect(pills.getByRole("button", { name: /Dotonbori dinner/ })).toContainText("6:30 PM - 7:30 PM");
});
