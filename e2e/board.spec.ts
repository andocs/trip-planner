import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

const CARD = "Trang An Scenic Landscape Complex"; // a seeded "Maybe" sight, so a draft

test("owner: paste several ideas and get one draft per line", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");

  await expect(page.getByRole("radio", { name: "Board" })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Draft 20/ })).toBeVisible(); // 8 sights + 12 food places are Idea/Maybe
  await expect(page.getByText(/don.t count toward the budget/)).toBeVisible();

  const before = fake.tables.get("hotel_ideas")!.length;
  await page.getByRole("button", { name: "Add idea" }).click();
  await page.getByRole("radio", { name: "Paste a list" }).click();
  const sheet = page.getByRole("dialog", { name: "Add place" });
  await sheet
    .getByRole("textbox")
    .first()
    .fill("Old Quarter boutique hotel - 3800\nHmong homestay in Ta Van - 1900\nTrain Street cafe");
  await sheet.getByLabel("Location or area (for all)").fill("Hanoi");
  await expect(sheet.getByText("3 places, added as drafts.")).toBeVisible();
  await expect(sheet.getByText(/PHP 3,800/)).toBeVisible();
  await sheet.getByRole("button", { name: "Remove Train Street cafe" }).click();
  await sheet.getByRole("button", { name: "Add 2 places", exact: true }).click();

  await expect.poll(() => fake.tables.get("hotel_ideas")!.length).toBe(before + 2);
  const added = fake.tables
    .get("hotel_ideas")!
    .filter((h) => h.city === "Hanoi" && String(h.hotel).match(/Quarter|Hmong/));
  expect(added.map((h) => [h.hotel, h.total, h.decision])).toEqual([
    ["Old Quarter boutique hotel", 3800, "draft"],
    ["Hmong homestay in Ta Van", 1900, "draft"],
  ]);
  await expect(page.getByRole("article", { name: "Old Quarter boutique hotel" })).toBeVisible();
});

test("owner: confirm a draft; it moves to Confirmed and counts", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");
  await page.getByRole("article", { name: CARD }).getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => fake.tables.get("attractions")!.find((a) => a.name === CARD)?.decision).toBe("confirmed");
  await expect(page.getByRole("article", { name: CARD })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^Draft 19/ })).toBeVisible();
  await page.getByRole("radio", { name: /^Confirmed/ }).click();
  await expect(page.getByRole("article", { name: CARD })).toBeVisible();
});

test("owner: a tentative stop is dashed and uncounted; confirming makes it solid", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");
  await page.getByRole("article", { name: CARD }).getByRole("button", { name: "Add to itinerary" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to itinerary" });
  await sheet.getByLabel("Day").selectOption("3");
  await sheet.getByRole("button", { name: "Add stop" }).click();

  await expect.poll(() => fake.tables.get("itinerary_items")!.find((i) => i.activity === CARD)?.tentative).toBe(true);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible(); // not counted
  const stop = page.getByRole("button", { name: new RegExp(`Tentative: ${CARD}`) });
  await expect(stop).toBeVisible();
  await expect(page.getByText(/1 tentative stop isn.t in this day.s count/)).toBeVisible();

  // Confirm the source on the board (the card's menu links to it): the stop becomes a normal, counted stop.
  await stop.click();
  await page.getByRole("menuitem", { name: /on the board/ }).click();
  await expect(page.getByRole("dialog", { name: CARD })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Confirm this sight/ })
    .click();
  await expect.poll(() => fake.tables.get("itinerary_items")!.find((i) => i.activity === CARD)?.tentative).toBe(false);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 141 done")).toBeVisible();
  // No longer tentative: its menu has no "Open on the board".
  await page.getByRole("button", { name: new RegExp(`${CARD}\\. Menu`) }).click();
  await expect(page.getByRole("menuitem", { name: /on the board/ })).toHaveCount(0);
});

test("owner: dropping an idea removes its tentative stop and lists it under Dropped", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");
  await page.getByRole("article", { name: CARD }).getByRole("button", { name: "Add to itinerary" }).click();
  await page.getByRole("dialog", { name: "Add to itinerary" }).getByRole("button", { name: "Add stop" }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")!.some((i) => i.activity === CARD)).toBe(true);

  await page.getByRole("button", { name: `Open ${CARD}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Drop", exact: true }).click();
  await expect.poll(() => fake.tables.get("attractions")!.find((a) => a.name === CARD)?.decision).toBe("dropped");
  expect(fake.tables.get("itinerary_items")!.some((i) => i.activity === CARD)).toBe(false);
  await page.getByRole("radio", { name: /^Dropped 1/ }).click();
  await expect(
    page.getByRole("article", { name: CARD }).getByRole("button", { name: "Restore to drafts" }),
  ).toBeVisible();
});

test("viewer: votes (name asked once), comments, and has no edit controls", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  await fake.install(page);
  await page.goto("/places");

  await expect(page.getByText(/You can vote and comment on ideas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add idea" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to itinerary" })).toHaveCount(0);

  // First vote asks for a name, then saves the vote.
  const card = page.getByRole("article", { name: CARD });
  await card.getByRole("button", { name: /I.m in/ }).click();
  const ask = page.getByRole("dialog", { name: "What should we call you?" });
  await ask.getByLabel("Your name").fill("Tita Rose");
  await ask.getByRole("button", { name: "Save and vote" }).click();
  await expect.poll(() => fake.myLabel).toBe("Tita Rose");
  await expect
    .poll(() => fake.tables.get("votes")?.map((v) => [v.user_id, v.item_id, v.value]))
    .toEqual([[fake.userId, fake.tables.get("attractions")!.find((a) => a.name === CARD)!.id, "in"]]);
  await expect(card.getByRole("button", { name: /I.m in/ })).toHaveAttribute("aria-pressed", "true");

  // Changing it, then a different idea: no second name prompt.
  await card
    .getByRole("group", { name: /^Your vote on/ })
    .getByRole("button", { name: "Maybe" })
    .click();
  await expect.poll(() => fake.tables.get("votes")?.[0]?.value).toBe("maybe");
  const other = page.getByRole("article", { name: "Bich Dong Pagoda" });
  await other
    .getByRole("group", { name: /^Your vote on/ })
    .getByRole("button", { name: "Pass" })
    .click();
  await expect.poll(() => fake.tables.get("votes")?.length).toBe(2);
  await expect(page.getByRole("dialog", { name: "What should we call you?" })).toHaveCount(0);

  // Comment thread in the detail sheet.
  await page.getByRole("button", { name: `Open ${CARD}` }).click();
  const detail = page.getByRole("dialog", { name: CARD });
  await detail.getByLabel("Add a comment").fill("Is it walkable from the station?");
  await detail.getByLabel("Add a comment").press("Enter");
  await expect(detail.getByText("Is it walkable from the station?")).toBeVisible();
  await expect(detail.getByText("Tita Rose").first()).toBeVisible();
  expect(fake.tables.get("comments")!.map((c) => [c.user_id, c.body])).toEqual([
    [fake.userId, "Is it walkable from the station?"],
  ]);
  await expect(detail.getByRole("button", { name: "Drop", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
});

test("votes and comments from another phone appear live, with names", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.addPerson("00000000-0000-4000-8000-0000000000bb", "Mama");
  await fake.install(page);
  await page.goto("/places");
  const card = page.getByRole("article", { name: CARD });
  await expect(card).toBeVisible();
  await expect.poll(() => fake.realtimeJoined).toBe(true);

  const itemId = fake.tables.get("attractions")!.find((a) => a.name === CARD)!.id;
  fake.remoteChange("votes", "INSERT", {
    id: "v-remote",
    trip_id: fake.trip.id as string,
    item_table: "attractions",
    item_id: itemId,
    user_id: "00000000-0000-4000-8000-0000000000bb",
    value: "in",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await expect(card.getByText(/In: 1/)).toBeVisible();
  fake.remoteChange("comments", "INSERT", {
    id: "c-remote",
    trip_id: fake.trip.id as string,
    item_table: "attractions",
    item_id: itemId,
    user_id: "00000000-0000-4000-8000-0000000000bb",
    body: "Bring a hat",
    created_at: new Date().toISOString(),
  });
  await expect(card.getByText(/Comments: 1/)).toBeVisible();
  await page.getByRole("button", { name: `Open ${CARD}` }).click();
  const detail = page.getByRole("dialog", { name: CARD });
  await expect(detail.getByText("Bring a hat")).toBeVisible();
  await expect(detail.getByText("Mama").first()).toBeVisible();

  // The owner can delete anyone's comment.
  await detail.getByRole("button", { name: "Delete comment by Mama" }).click();
  await expect(detail.getByText("Bring a hat")).toHaveCount(0);
});

test("N opens quick add from any screen for the owner, and does nothing for a viewer", async ({ page }) => {
  const owner = createFakeSupabase({ withSeed: true });
  await owner.install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Add place" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add place" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add idea" })).toBeVisible(); // the floating button works on every screen
});

test("viewer: N and the quick-add button do not exist", async ({ page }) => {
  await createFakeSupabase({ withSeed: true, role: "viewer" }).install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add idea" })).toHaveCount(0);
});

test("the Places board does not scroll sideways on a laptop screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/places");
  await expect(page.getByRole("radio", { name: "Board" })).toBeChecked();
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.view);
});
