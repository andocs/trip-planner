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
  await page.getByRole("menuitem", { name: /^Sightseeing/ }).click();
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
  await page.getByRole("dialog", { name: "Umeda Sky Building" }).getByRole("button", { name: "Edit details" }).click();
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
  await page.getByRole("dialog", { name: "Osaka Castle" }).getByRole("button", { name: "Edit details" }).click();
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

test("flight time zones: suggested from the airport codes, saved, and the flight time is worked out from them", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/flights");
  await page.getByRole("button", { name: /^MNL to HAN.*Edit$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Edit flight" });
  // Manila to Hanoi: the zones come from the codes. Manila is 1 hour ahead, so 22:20 -> 00:45 is 3h 25m in the air.
  const zones = sheet.getByLabel("Time zone");
  await expect(zones.nth(0)).toHaveValue("Asia/Manila");
  await expect(zones.nth(1)).toHaveValue("Asia/Ho_Chi_Minh");
  await expect(sheet.getByRole("status")).toContainText("Flight time 3h 25m");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => fake.tables.get("flights")?.find((f) => f.from_code === "MNL")?.arr_tz).toBe("Asia/Ho_Chi_Minh");
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  expect(flight).toMatchObject({ dep_tz: "Asia/Manila", duration_min: null });
  const pass = page.getByRole("article", { name: /^MNL to HAN/ });
  await expect(pass).toContainText("3h 25m");
  await expect(pass).toContainText("GMT+8");
  await expect(pass).toContainText("GMT+7");
});

test("a flight saved without zones shows no calculated time", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/flights");
  await expect(page.getByRole("article", { name: /^MNL to HAN/ })).not.toContainText("3h 25m");
});

test("owner: the trip's home time zone is set in Settings", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/settings");
  const zone = page.getByLabel("Home time zone");
  await expect(zone).toHaveValue("Asia/Manila");
  await zone.selectOption("Asia/Tokyo");
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect.poll(() => fake.trip.timezone).toBe("Asia/Tokyo");
});

test("owner: a stay takes the same grouped form, with website and Google Maps link", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/stays");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add a confirmed stay/ }).click();
  await page.getByRole("dialog", { name: "Add a confirmed stay" }).getByRole("button", { name: "Enter a new stay" }).click();
  const sheet = page.getByRole("dialog", { name: "Add stay" });
  await expect(sheet.getByRole("heading", { name: "The place" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Dates and booking" })).toBeVisible();
  // The same form as a place, without the category, "how many" and draft/confirmed pills.
  await expect(sheet.getByRole("radio", { name: "Food" })).toHaveCount(0);
  await expect(sheet.getByRole("radio", { name: "Paste a list" })).toHaveCount(0);
  await sheet.getByLabel("Name").fill("Namba Guesthouse");
  await sheet.getByLabel("Website").fill("https://example.com/namba");
  await sheet.getByLabel("Google Maps link").fill("https://maps.app.goo.gl/namba");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => fake.tables.get("stays")?.find((s) => s.hotel === "Namba Guesthouse")).toBeTruthy();
  expect(fake.tables.get("stays")!.find((s) => s.hotel === "Namba Guesthouse")!.details).toMatchObject({ website: "https://example.com/namba", mapsUrl: "https://maps.app.goo.gl/namba" });
});

test("the activity view has the idea-sheet layout: facts, actions for the owner, Mark complete works from it", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake, { website: "https://example.com/castle" });
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Open Osaka Castle" }).click();
  const view = page.getByRole("dialog", { name: "Osaka Castle" });
  await expect(view.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(view.getByRole("link", { name: /Website/ })).toBeVisible();
  await expect(view.getByText("9:00 AM - 10:00 AM")).toBeVisible();
  await view.getByRole("button", { name: "Mark complete" }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")!.find((i) => i.activity === "Osaka Castle")?.done).toBe(true);
});

test("a viewer's activity view has no actions", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Open Osaka Castle" }).click();
  const view = page.getByRole("dialog", { name: "Osaka Castle" });
  await expect(view).toBeVisible();
  await expect(view.getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await expect(view.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("the map card has a photo area, day and facts, and View details opens the view; reducing the map closes it", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/itinerary");
  await page.getByRole("group", { name: "Show days" }).getByRole("button", { name: "Day 1", exact: true }).click();
  await page.getByRole("group", { name: "Activities on day 1" }).getByRole("button", { name: /Osaka Castle/ }).click();
  const card = page.getByRole("complementary", { name: /Osaka Castle, selected stop/ });
  await expect(card).toContainText("Day 1 · Tue 16 Jun");
  await expect(card).toContainText("9:00 AM - 10:00 AM");
  await card.getByRole("button", { name: "View details" }).click();
  await expect(page.getByRole("dialog", { name: "Osaka Castle" })).toBeVisible();
  await page.getByRole("dialog", { name: "Osaka Castle" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Reduce map" }).click();
  await expect(card).toHaveCount(0);
});

test("a place already on the itinerary says so, and adding it again asks first", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = fake.tables.get("attractions")!.find((a) => a.decision === "draft")!;
  const tripId = fake.tables.get("itinerary_items")![0].trip_id;
  fake.tables.set("itinerary_items", [
    {
      id: "t-added", trip_id: tripId, day: 2, on_date: "2026-06-17", city: null, at_time: null, activity: String(idea.name), type: "Sightseeing",
      duration_min: 60, note: null, done: false, created_at: "2026-06-01T00:00:00Z", source_table: "attractions", source_id: idea.id,
      tentative: true, position: 1000, kind: "stop", details: {},
    },
  ]);
  await fake.install(page);
  await page.goto("/places?cat=sight");
  const card = page.getByRole("article", { name: String(idea.name) });
  await expect(card.getByRole("button", { name: /Already in the itinerary \(Day 2\)/ })).toBeVisible();
  await expect(card.getByRole("button", { name: "Add to itinerary" })).toHaveCount(0);
  await card.getByRole("button", { name: /Already in the itinerary/ }).click();
  const ask = page.getByRole("dialog", { name: "Already in the itinerary" });
  await expect(ask).toContainText("Day 2");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Add to itinerary" })).toHaveCount(0);
  await card.getByRole("button", { name: /Already in the itinerary/ }).click();
  await page.getByRole("dialog", { name: "Already in the itinerary" }).getByRole("button", { name: "Add again" }).click();
  await expect(page.getByRole("dialog", { name: "Add to itinerary" })).toBeVisible();
});

test("a place that is not on the itinerary adds straight away, with no question", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.set("itinerary_items", []);
  const idea = fake.tables.get("attractions")!.find((a) => a.decision === "draft")!;
  await fake.install(page);
  await page.goto("/places?cat=sight");
  await page.getByRole("article", { name: String(idea.name) }).getByRole("button", { name: "Add to itinerary" }).click();
  await expect(page.getByRole("dialog", { name: "Add to itinerary" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Already in the itinerary" })).toHaveCount(0);
});

test("Add activity: a place already on the itinerary is marked, and picking it asks first", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = fake.tables.get("attractions")!.find((a) => a.decision === "draft")!;
  const tripId = fake.tables.get("itinerary_items")![0].trip_id;
  fake.tables.set("itinerary_items", [
    {
      id: "t-added", trip_id: tripId, day: 3, on_date: "2026-06-18", city: null, at_time: null, activity: String(idea.name), type: "Sightseeing",
      duration_min: 60, note: null, done: false, created_at: "2026-06-01T00:00:00Z", source_table: "attractions", source_id: idea.id,
      tentative: true, position: 1000, kind: "stop", details: {},
    },
  ]);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Sightseeing/ }).click();
  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await sheet.getByRole("button", { name: /Pick from your Places/ }).click();
  await sheet.getByLabel("Search your places").fill(String(idea.name));
  await expect(sheet.getByText("Already in itinerary · Day 3")).toBeVisible();
  await sheet.getByRole("button", { name: String(idea.name) }).first().click();
  await expect(sheet.getByText(/is already on the itinerary \(Day 3\)\. Add it again\?/)).toBeVisible();
  await sheet.getByRole("button", { name: "Add again" }).click();
  await expect(sheet.getByLabel("Activity")).toHaveValue(String(idea.name));
});

/** A draft hotel idea to work with (the seed has none that is still a draft). */
function addHotelIdea(fake: ReturnType<typeof createFakeSupabase>, details: Record<string, unknown>) {
  const base = fake.tables.get("hotel_ideas")![0];
  const idea = { ...base, id: "11111111-1111-4111-8111-111111111111", hotel: "Namba Test Inn", decision: "draft", total: null, nights: null, details };
  fake.tables.set("hotel_ideas", [...fake.tables.get("hotel_ideas")!, idea]);
  return idea;
}

test("Stays: a confirmed stay is picked from the ideas, and it links the idea to the stay", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = addHotelIdea(fake, {});
  await fake.install(page);
  await page.goto("/stays");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add a confirmed stay/ }).click();
  const picker = page.getByRole("dialog", { name: "Add a confirmed stay" });
  await picker.getByRole("button", { name: String(idea.hotel) }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add stay" });
  await expect(sheet.getByLabel("Name")).toHaveValue(String(idea.hotel));
  await sheet.getByLabel("Check-in", { exact: true }).fill("2026-06-20");
  await sheet.getByLabel("Check-out", { exact: true }).fill("2026-06-23");
  await sheet.getByRole("button", { name: "Booked", exact: true }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => fake.tables.get("stays")!.find((s) => (s.details as Record<string, unknown>)?.ideaId === idea.id)).toBeTruthy();
  const stay = fake.tables.get("stays")!.find((s) => (s.details as Record<string, unknown>)?.ideaId === idea.id)!;
  expect(stay).toMatchObject({ check_in: "2026-06-20", check_out: "2026-06-23", status: "Booked" });
  expect(fake.tables.get("hotel_ideas")!.find((h) => h.id === idea.id)!.decision).toBe("confirmed");
});

test("Stays: Add a plan or idea opens the place form on Stay", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/stays");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add a plan or idea/ }).click();
  await expect(page.getByRole("dialog", { name: "Add place" })).toBeVisible();
});

test("confirming a stay idea asks first, and adds it to Stays too", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = addHotelIdea(fake, { checkInDay: 2, checkOutDay: 4, cancellation: "free" });
  const before = fake.tables.get("stays")!.length;
  await fake.install(page);
  await page.goto("/places?cat=stay");
  await page.getByRole("article", { name: String(idea.hotel) }).getByRole("button", { name: "Confirm" }).click();
  const ask = page.getByRole("dialog", { name: /^Confirm “/ });
  await expect(ask).toContainText("added to the Stays page");
  await ask.getByRole("button", { name: /^Confirm/ }).click();
  await expect.poll(() => fake.tables.get("stays")!.length).toBe(before + 1);
  const stay = fake.tables.get("stays")!.find((s) => (s.details as Record<string, unknown>)?.ideaId === idea.id)!;
  expect(stay).toMatchObject({ hotel: idea.hotel, check_in: "2026-06-17", check_out: "2026-06-19", status: "Planned" });
});

test("a stay idea with no dates cannot be confirmed until it has them", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = addHotelIdea(fake, {});
  await fake.install(page);
  await page.goto("/places?cat=stay");
  await page.getByRole("article", { name: String(idea.hotel) }).getByRole("button", { name: "Confirm" }).click();
  const ask = page.getByRole("dialog", { name: /^Confirm “/ });
  await expect(ask).toContainText("Add a check-in day.");
  await expect(ask.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await ask.getByRole("button", { name: "Edit details" }).click();
  await expect(page.getByRole("dialog", { name: "Edit stay" })).toBeVisible();
});

test("a dropped idea can be deleted for good, after asking", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const idea = fake.tables.get("attractions")!.find((a) => a.decision === "draft")!;
  idea.decision = "dropped";
  await fake.install(page);
  await page.goto("/places?cat=sight");
  await page.getByRole("radio", { name: /^Dropped/ }).click();
  await page.getByRole("article", { name: String(idea.name) }).getByRole("button", { name: /^Delete/ }).click();
  await page.getByRole("dialog", { name: "Delete this place?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article", { name: String(idea.name) })).toHaveCount(0);
});

test("a day may end on a commute (an overnight ride)", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Add after Dotonbori dinner" }).click();
  await page.getByRole("button", { name: "Commute", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add commute" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Taxi / Grab" }).click();
  await sheet.getByLabel("Or any number of minutes").fill("600");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => fake.tables.get("itinerary_items")!.some((i) => i.kind === "commute")).toBe(true);
});

test("Spend: split an expense by percent between two people; a split that doesn't add up is refused", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const travelers = fake.tables.get("travelers")!;
  const [a, b] = travelers;
  await fake.install(page);
  await page.goto("/spend");
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add expense" });
  await sheet.getByLabel("Description").fill("Dinner at the lake");
  await sheet.getByLabel(/^Amount/).fill("1100");
  await sheet.getByRole("radio", { name: "By percent" }).click();
  await sheet.getByLabel(`${a.name} (%)`).fill("60");
  await sheet.getByLabel(`${b.name} (%)`).fill("30");
  await sheet.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect(sheet.getByText(/add up to 90, not 100/)).toBeVisible();
  await sheet.getByLabel(`${b.name} (%)`).fill("40");
  await sheet.getByLabel("Service charge included (%)").fill("10");
  await sheet.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect.poll(() => fake.tables.get("expenses")!.find((e) => e.description === "Dinner at the lake")).toBeTruthy();
  const saved = fake.tables.get("expenses")!.find((e) => e.description === "Dinner at the lake")!;
  expect(saved.split).toMatchObject({ mode: "percent", servicePct: 10, serviceSplit: "proportional" });
  expect((saved.split as { shares: Record<string, number> }).shares).toMatchObject({ [String(a.id)]: 60, [String(b.id)]: 40 });
});

test("Spend: the balance summary says who owes whom, for any person", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const tripId = fake.tables.get("travelers")![0].trip_id;
  fake.tables.set("travelers", [
    { id: "tv-ana", trip_id: tripId, name: "Ana", sort: 0, created_at: "2026-06-01T00:00:00Z" },
    { id: "tv-ben", trip_id: tripId, name: "Ben", sort: 1, created_at: "2026-06-01T00:00:00Z" },
  ]);
  fake.tables.set("expenses", [
    { id: "e1", trip_id: tripId, spent_on: "2026-06-16", description: "Hotel", amount: 1000, currency: "PHP", category_id: null, paid_by: "tv-ana", note: null, created_at: "2026-06-16T00:00:00Z", source_table: null, source_id: null, split: null },
  ]);
  await fake.install(page);
  await page.goto("/spend");
  await page.getByRole("radio", { name: "Settle up" }).click();
  const summary = page.getByRole("heading", { name: /balance/i }).locator("..").locator("..");
  await page.getByLabel("Show the balance of").selectOption("tv-ben");
  await expect(summary).toContainText("Owes");
  await expect(summary).toContainText("500");
  await page.getByLabel("Show the balance of").selectOption("tv-ana");
  await expect(summary).toContainText("Owed");
});

test("Add place: photos can be added before the place is saved", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");
  await page.getByRole("button", { name: "Add" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add place" });
  await expect(sheet.getByRole("heading", { name: "Links and photos" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add a photo" })).toBeVisible();
});

test("Edit activity follows the category: food shows food details, and they are saved with the activity", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");
  await page.getByRole("button", { name: "Open Osaka Castle" }).click();
  await page.getByRole("dialog", { name: "Osaka Castle" }).getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit activity" });
  // Sight is the layout for sightseeing (and the generic one).
  await expect(edit.getByRole("heading", { name: "Sight details" })).toBeVisible();
  await edit.getByRole("button", { name: "Category" }).click();
  await page.getByRole("menuitem", { name: /^Food & Drink/ }).click();
  await expect(edit.getByRole("heading", { name: "Food details" })).toBeVisible();
  await edit.getByRole("button", { name: "Food details" }).click();
  await edit.getByLabel("Opening hours / best time to go").fill("11:00 to 14:00");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => (fake.tables.get("itinerary_items")!.find((i) => i.activity === "Osaka Castle")!.details as { place?: { hours?: string } }).place?.hours)
    .toBe("11:00 to 14:00");
  // The details show in the view.
  await page.getByRole("button", { name: "Open Osaka Castle" }).click();
  await expect(page.getByRole("dialog", { name: "Osaka Castle" })).toContainText("11:00 to 14:00");
});

test("a stay's view: dates, total, a hidden confirmation number you can show, and a menu for Cancel and Delete", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const stay = fake.tables.get("stays")![0];
  stay.hotel = "Lakeside Inn";
  Object.assign(stay, { status: "Booked", check_in: "2026-06-20", check_out: "2026-06-23", total: 11400, confirmation: "ABC123", details: { cancellation: "free", freeUntil: "2026-06-15" } });
  await fake.install(page);
  await page.goto("/stays");
  await page.getByRole("button", { name: "Open Lakeside Inn" }).click();
  const view = page.getByRole("dialog", { name: "Lakeside Inn" });
  await expect(view.getByText("Nights")).toBeVisible();
  await expect(view.getByText("PHP 3,800.00 per night")).toBeVisible();
  await expect(view.getByText("ABC123")).toHaveCount(0);
  await view.getByRole("button", { name: "Show" }).click();
  await expect(view.getByText("ABC123")).toBeVisible();
  await view.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel stay" }).click();
  await expect.poll(() => fake.tables.get("stays")!.find((s) => s.id === stay.id)?.status).toBe("Cancelled");
});

test("a card dips as one piece when pressed", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places?cat=sight");
  const card = page.getByRole("article").first();
  const open = card.getByRole("button", { name: /^Open / }).first();
  const box = await card.boundingBox();
  await open.hover();
  await page.mouse.down();
  await page.waitForTimeout(250);
  // The article itself carries the transform (the :has rule), not only the photo or the text button.
  const scale = await card.evaluate((el) => getComputedStyle(el).transform);
  expect(scale).not.toBe("none");
  const now = await card.boundingBox();
  expect(now!.width).toBeLessThan(box!.width);
  await page.mouse.move(0, 0);
  await page.mouse.up();
});

test("Add activity: the category is chosen from a menu (top Add and the small +), and the status chip sits beside the kind", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  plan(fake);
  await fake.install(page);
  await page.goto("/itinerary");

  // The top Add button asks which kind first; the sheet then shows it, with that category's details.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Food & Drink/ }).click();
  const sheet = page.getByRole("dialog", { name: "Add activity" });
  await expect(sheet.getByRole("button", { name: "Category" })).toContainText("Food & Drink");
  await expect(sheet.getByRole("heading", { name: "Food details" })).toBeVisible();
  await sheet.getByRole("button", { name: "Category" }).click();
  await page.getByRole("menuitem", { name: /^Rest & Stay/ }).click();
  await expect(sheet.getByRole("heading", { name: "Stay details" })).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  // The small + after a place: its Activity option asks for the category too.
  await page.getByRole("button", { name: "Add after Osaka Castle" }).click();
  const fan = page.getByRole("group", { name: "After Osaka Castle" });
  await fan.getByRole("button", { name: "Activity" }).click();
  // Dismissing the category menu leaves the expanded button open.
  await page.keyboard.press("Escape");
  await expect(fan.getByRole("button", { name: "Commute" })).toBeVisible();
  await fan.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("menuitem", { name: /^Shopping/ }).click();
  await expect(page.getByRole("dialog", { name: "Add activity" }).getByRole("button", { name: "Category" })).toContainText("Shopping");
});
