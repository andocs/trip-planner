import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

/** A small, known itinerary: Day 1 has three places, Day 2 has one. Trip start is 16 Jun (Day 1). */
function plan(fake: ReturnType<typeof createFakeSupabase>, role: "owner" | "viewer" = "owner") {
  const tripId = fake.tables.get("itinerary_items")![0].trip_id;
  const row = (activity: string, day: number, position: number, over: Record<string, unknown> = {}) => ({
    id: `t-${activity.replace(/\W+/g, "-").toLowerCase()}`,
    trip_id: tripId,
    day,
    on_date: `2026-06-${15 + day}`,
    city: "Hanoi",
    at_time: null,
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
    details: {},
    ...over,
  });
  fake.tables.set("itinerary_items", [
    row("Lake walk", 1, 1000),
    row("Bun cha lunch", 1, 2000),
    row("Temple visit", 1, 3000),
    row("Boat tour", 2, 1000),
  ]);
  void role;
}

test("owner: a commute goes between two places, with its length and cost, and counts toward the day", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  await expect(page.getByRole("separator", { name: /^Day 1 ·/ })).toBeVisible();
  await page.getByRole("button", { name: "Add after Lake walk" }).click();
  await page.getByRole("button", { name: "Commute", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add commute" });
  await sheet.getByRole("button", { name: "Taxi / Grab" }).click();
  await sheet.getByLabel("Or any number of minutes").fill("25");
  await sheet.getByLabel(/^Cost/).fill("180");
  await sheet.getByLabel("Note (optional)").fill("Grab from the lake");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();

  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.kind === "commute")).toBeTruthy();
  const c = fake.tables.get("itinerary_items")!.find((i) => i.kind === "commute")!;
  expect(c).toMatchObject({ activity: "Taxi / Grab", duration_min: 25, day: 1 });
  expect(c.position).toBe(1500); // between 1000 and 2000: no other row was touched
  expect(c.details).toEqual({ mode: "taxi", cost: 180, note: "Grab from the lake" });
  await expect(page.getByRole("button", { name: /Taxi \/ Grab, 25m\. Edit/ })).toBeVisible();
  await expect(page.getByText("Grab from the lake")).toBeVisible();
  // Day 1: three places of an hour plus a 25-minute commute. The commute is not a place and is not counted as one.
  await expect(page.getByRole("separator", { name: /^Day 1 ·/ }).locator("..").getByText("3 places · 3h 25m")).toBeVisible();
  await expect(page.getByText("0 of 4 done")).toBeVisible();
});

test("owner: the + under a place opens into Commute, Rest and Activity, and an activity lands right after it", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  await page.getByRole("button", { name: "Add after Lake walk" }).click();
  const options = page.getByRole("group", { name: "After Lake walk" });
  await expect(options.getByRole("button", { name: "Commute" })).toBeVisible();
  await expect(options.getByRole("button", { name: "Rest" })).toBeVisible();
  await options.getByRole("button", { name: "Activity" }).click();

  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await expect(sheet.getByRole("button", { name: /^Day 1(?!\d)/ })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText(/Goes between/)).toContainText("Lake walk and Bun cha lunch on Day 1 · Tue 16 Jun");
  await sheet.getByLabel("Activity", { exact: true }).fill("Egg coffee stop");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();

  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.activity === "Egg coffee stop")).toBeTruthy();
  const added = fake.tables.get("itinerary_items")!.find((i) => i.activity === "Egg coffee stop")!;
  expect(added).toMatchObject({ day: 1, position: 1500 }); // between Lake walk (1000) and the next place (2000)
});

test("the + opens from the keyboard", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  await page.getByRole("button", { name: "Add after Lake walk" }).focus();
  const options = page.getByRole("group", { name: "After Lake walk" });
  await expect(options.getByRole("button", { name: "Activity" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(options.getByRole("button", { name: "Activity" })).toHaveCount(0);
});

test("owner: Rest from the + adds a rest between two places", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  await page.getByRole("button", { name: "Add after Lake walk" }).click();
  await page.getByRole("group", { name: "After Lake walk" }).getByRole("button", { name: "Rest" }).click();
  const sheet = page.getByRole("dialog", { name: "Add rest" });
  await sheet.getByLabel("Or any number of minutes").fill("20");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();

  await expect.poll(() => fake.tables.get("itinerary_items")?.find((i) => i.kind === "buffer")).toBeTruthy();
  expect(fake.tables.get("itinerary_items")!.find((i) => i.kind === "buffer")).toMatchObject({ duration_min: 20, day: 1, position: 1500 });
});

test("a commute can't sit next to another commute, so the + is not offered next to one", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  const items = fake.tables.get("itinerary_items")!;
  items.push({ ...items[0], id: "t-commute", activity: "Walk", kind: "commute", position: 1500, duration_min: 12, details: { mode: "walk" } });
  await fake.install(page);
  await page.goto("/itinerary");

  // Lake walk is followed by a commute, so there is no + after it; Bun cha lunch -> Temple visit still has one.
  await expect(page.getByRole("button", { name: "Add after Lake walk" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add after Bun cha lunch" })).toBeAttached();
  await expect(page.getByRole("button", { name: /^Walk, 12m\. Edit/ })).toBeVisible();
});

test("owner: a long day gets a soft warning", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  fake.tables.get("itinerary_items")!.forEach((i) => i.day === 1 && Object.assign(i, { duration_min: 240 })); // 12 hours
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("Long day")).toBeVisible();
  await expect(page.getByRole("separator", { name: /^Day 2 ·/ }).locator("..").getByText("Long day")).toHaveCount(0);
});

test("owner: reorder with the keyboard changes one row, and the order survives", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  await page.getByRole("button", { name: "Reorder" }).click();
  const before = JSON.stringify(fake.tables.get("itinerary_items")!.map((i) => [i.id, i.position]));
  const handle = page.getByRole("button", { name: "Drag Lake walk" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(250); // dnd-kit measures the list after it picks the item up
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");

  await expect.poll(() => JSON.stringify(fake.tables.get("itinerary_items")!.map((i) => [i.id, i.position]))).not.toBe(before);
  const rows = fake.tables.get("itinerary_items")!;
  const day1 = rows.filter((i) => i.day === 1).sort((a, b) => Number(a.position) - Number(b.position)).map((i) => i.activity);
  expect(day1).toEqual(["Bun cha lunch", "Lake walk", "Temple visit"]);
  // One row moved: the other two kept their numbers.
  expect(rows.find((i) => i.activity === "Bun cha lunch")!.position).toBe(2000);
  expect(rows.find((i) => i.activity === "Temple visit")!.position).toBe(3000);
  await page.getByRole("button", { name: "Done" }).click();
  const order = await page.getByRole("heading", { level: 3 }).allInnerTexts();
  expect(order.slice(0, 3)).toEqual(["Bun cha lunch", "Lake walk", "Temple visit"]);
});

test("a stay appears on its check-in day by itself", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  Object.assign(fake.tables.get("stays")![0], { hotel: "Old Quarter boutique hotel", status: "Booked", check_in: "2026-06-17", check_out: "2026-06-18" });
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("link", { name: /Old Quarter boutique hotel/ }).first()).toBeVisible();
  await expect(page.getByText("Stay · check in").first()).toBeVisible();
});

test("a place shows the cover photo saved on its board idea, else a placeholder", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  const idea = fake.tables.get("attractions")!.find((a) => a.name === "One Pillar Pagoda")!;
  Object.assign(fake.tables.get("itinerary_items")![0], { source_table: "attractions", source_id: idea.id, tentative: false });
  fake.tables.set("item_images", [
    { id: "im1", trip_id: idea.trip_id, item_table: "attractions", item_id: idea.id, source: "link", url: "https://example.com/p.jpg", page_url: null, credit: null, license: null, license_url: null, position: 0, created_at: new Date().toISOString() },
  ]);
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("img", { name: "Photo of Lake walk" })).toBeAttached();
  await expect(page.getByText("No photo").first()).toBeVisible();
});

test("viewer: a static list with no reorder, no add and no handles", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("heading", { name: "Lake walk" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reorder" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Drag / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Add after / })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("on a wide screen the route sits beside the list, with no Map pill", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/itinerary");
  await expect(page.getByRole("complementary", { name: "Route" })).toBeVisible();
  await expect(page.getByText("Stops in order. Straight lines, no routing service.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Map", exact: true })).toBeHidden();
});

test("the + sits centred under its place and opens into one 340 by 44 line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  const row = page.getByRole("heading", { name: "Lake walk" });
  const card = row.locator("xpath=ancestor::li[1]");
  const zone = card.locator("xpath=following-sibling::li[1]");
  await zone.hover();
  const trigger = page.getByRole("button", { name: "Add after Lake walk" });
  const pill = page.getByRole("group", { name: "After Lake walk" });
  // The whole control stays centred in the list whether it is a circle or the open line (the wide layout also
  // settles just after hydration, so measure until it holds still).
  await expect
    .poll(async () => {
      const [t, list] = [await pill.boundingBox(), await pill.locator("xpath=ancestor::ol[1]").boundingBox()];
      return Math.abs(t!.x + t!.width / 2 - (list!.x + list!.width / 2));
    })
    .toBeLessThan(2);
  // Opened, it is one 340 by 44 line.
  await trigger.hover();
  await expect(pill.getByRole("button", { name: "Activity" })).toBeVisible();
  await expect.poll(async () => Math.round((await pill.boundingBox())!.width)).toBe(340);
  expect(Math.round((await pill.boundingBox())!.height)).toBe(44);
});

test("the map only loads when asked for (phone)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/itinerary");
  const map = page.getByRole("button", { name: "Map", exact: true });
  await expect(map).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Stops" })).toHaveCount(0);
  await map.click();
  await expect(map).toHaveAttribute("aria-pressed", "true");
});
