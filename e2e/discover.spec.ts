import { expect, test, type Page } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

// A 1x1 PNG, so no photo ever needs the network.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const CARDS = [
  {
    id: "ChIJ-hoankiem001",
    name: "Hoan Kiem Lake",
    lat: 21.0288,
    lng: 105.8522,
    address: "Hoàn Kiếm, Hanoi",
    type: "Lake",
    rating: 4.6,
    ratingCount: 48210,
    priceLevel: null,
    openNow: true,
    description: "A calm lake in the heart of the old quarter.",
    mapsUri: null,
    photo: null,
  },
  {
    id: "ChIJ-pillar00002",
    name: "One Pillar Pagoda",
    lat: 21.0359,
    lng: 105.8335,
    address: "Chùa Một Cột, Ba Đình",
    type: "Buddhist temple",
    rating: 4.4,
    ratingCount: 6312,
    priceLevel: 1,
    openNow: false,
    description: null,
    mapsUri: null,
    photo: { name: "places/ChIJ-pillar00002/photos/AaBb-cc_dd1234567890", authors: [{ name: "Minh Le", uri: null }] },
  },
];

const WIKI = {
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/lake.jpg/640px-lake.jpg",
  pageUrl: "https://commons.wikimedia.org/wiki/File:Lake.jpg",
  title: "Lake.jpg",
  author: "Dung Nguyen",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
};

type Calls = { search: number; image: number; details: number; photo: number };

/** Stubs every /api/places route and the image hosts. Counts the calls, because calls are what cost money. */
async function stubPlaces(page: Page, over: { search?: { status: number; body: unknown } } = {}) {
  const calls: Calls = { search: 0, image: 0, details: 0, photo: 0 };
  await page.route("**/api/places/search", (route) => {
    calls.search++;
    const o = over.search;
    return route.fulfill(o ? { status: o.status, json: o.body } : { json: { places: CARDS } });
  });
  await page.route("**/api/places/image", (route) => {
    calls.image++;
    const body = route.request().postDataJSON() as { name: string };
    return route.fulfill({ json: { photo: body.name === "Hoan Kiem Lake" ? WIKI : null } });
  });
  await page.route("**/api/places/details", (route) => {
    calls.details++;
    return route.fulfill({
      json: {
        id: "ChIJ-pillar00002",
        openNow: false,
        weekdayText: ["Monday: 8:00 AM – 6:00 PM", "Tuesday: 8:00 AM – 6:00 PM"],
      },
    });
  });
  await page.route("**/api/places/photo", (route) => {
    calls.photo++;
    return route.fulfill({ json: { uri: "https://lh3.googleusercontent.com/places/pillar=s640" } });
  });
  // Safety net: if anything ever tried to reach Google directly, fail loudly instead of spending a call.
  await page.route(/(maps|places).googleapis.com/, (route) => route.abort());
  for (const host of ["**/upload.wikimedia.org/**", "**/lh3.googleusercontent.com/**"])
    await page.route(host, (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
  return calls;
}

test("owner: one search; photos are Wikimedia first, then Google for shown cards; hours only on request", async ({
  page,
}) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  const calls = await stubPlaces(page);
  await page.goto("/places?tab=discover");

  await expect(page.getByRole("radio", { name: "Discover" })).toBeChecked();
  const lake = page.getByRole("article", { name: "Hoan Kiem Lake" });
  await expect(lake).toBeVisible();
  await expect(lake.getByText("4.6")).toBeVisible();
  await expect(lake.getByText("Open now")).toBeVisible();
  await expect(page.getByText("Suggestions from")).toBeVisible();

  // The free Wikimedia photo appears with the credit its licence requires; it is labelled as Wikimedia.
  await expect(lake.getByText("Photo: Dung Nguyen, CC BY-SA 4.0 · Wikimedia Commons")).toBeVisible();
  const pillar = page.getByRole("article", { name: "One Pillar Pagoda" });
  await expect(lake.getByText("A calm lake in the heart of the old quarter.")).toBeVisible();

  // A shown card with no free photo gets one Google photo, with Google's credit. Hours are never fetched by browsing.
  await expect(pillar.getByText("Photo: Minh Le · Google Maps")).toBeVisible();
  expect(calls).toMatchObject({ search: 1, details: 0, photo: 1 });

  // Opening the place spends nothing more; the hours cost one call and only when asked for.
  await pillar.getByRole("button", { name: "Open One Pillar Pagoda" }).click();
  const sheet = page.getByRole("dialog", { name: "One Pillar Pagoda" });
  await expect(sheet.getByText("Photo: Minh Le · Google Maps")).toBeVisible();
  expect(calls).toMatchObject({ search: 1, details: 0, photo: 1 });
  await sheet.getByRole("button", { name: "Show opening hours" }).click();
  await expect(sheet.getByText("Monday: 8:00 AM – 6:00 PM")).toBeVisible();
  await expect(sheet.getByText(/Details from/)).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
    "href",
    /query_place_id=ChIJ-pillar00002/,
  );
  expect(calls).toMatchObject({ search: 1, details: 1, photo: 1 });
  await page.keyboard.press("Escape");

  // Switching tabs and coming back never searches again by itself (every call is paid).
  await page.getByRole("radio", { name: "Board" }).click();
  await page.getByRole("radio", { name: "Discover" }).click();
  await expect(lake).toBeVisible();
  expect(calls.search).toBe(1);
});

test("owner: the list shows five places at a time and 'Show more' reveals the rest without searching again", async ({
  page,
}) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  const extra = Array.from({ length: 8 }, (_, i) => ({
    ...CARDS[0],
    id: `ChIJ-extra-place-${i}`,
    name: `Extra Place ${i + 1}`,
    description: null,
  }));
  const calls = await stubPlaces(page, { search: { status: 200, body: { places: [...CARDS, ...extra] } } });
  await page.goto("/places?tab=discover");

  await expect(page.getByRole("article")).toHaveCount(5);
  await page.getByRole("button", { name: /Show 5 more/ }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /Show d+ more/ })).toHaveCount(0);
  expect(calls.search).toBe(1);
});

test("owner: save keeps only the place id, the owner's own label and the licensed photo", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await stubPlaces(page);
  await page.goto("/places?tab=discover");

  const before = fake.tables.get("attractions")!.length;
  const lake = page.getByRole("article", { name: "Hoan Kiem Lake" });
  await expect(lake.getByText(/Wikimedia Commons/)).toBeVisible();
  await lake.getByRole("button", { name: "Save to board" }).click();
  const sheet = page.getByRole("dialog", { name: "Save to board" });
  await expect(sheet.getByLabel("Name on your board")).toHaveValue("Hoan Kiem Lake");
  await sheet.getByLabel("Name on your board").fill("Lake walk at dusk");
  await sheet.getByRole("button", { name: "Add draft" }).click();

  await expect.poll(() => fake.tables.get("attractions")!.length).toBe(before + 1);
  const idea = fake.tables.get("attractions")!.find((a) => a.name === "Lake walk at dusk")!;
  expect(idea).toMatchObject({ decision: "draft", city: "Hanoi" });
  await expect.poll(() => fake.tables.get("place_refs")?.length).toBe(1);
  const ref = fake.tables.get("place_refs")![0];
  expect(ref).toMatchObject({
    item_table: "attractions",
    item_id: idea.id,
    place_id: "ChIJ-hoankiem001",
  });
  expect(ref.coords_at).toBeTruthy();
  // The free Wikimedia picture is the idea's first photo, with its author and licence.
  await expect.poll(() => fake.tables.get("item_images")?.length).toBe(1);
  expect(fake.tables.get("item_images")![0]).toMatchObject({
    item_table: "attractions",
    item_id: idea.id,
    source: "wikimedia",
    credit: "Dung Nguyen",
    license: "CC BY-SA 4.0",
    position: 0,
    page_url: "https://commons.wikimedia.org/wiki/File:Lake.jpg",
  });
  // Nothing from Google beyond the id and coordinates is stored: no name, rating, hours or description.
  const stored = JSON.stringify([ref, idea, fake.tables.get("item_images")]);
  for (const forbidden of ["48210", "Hoàn Kiếm, Hanoi", "Open now", "weekday", "calm lake"]) expect(stored).not.toContain(forbidden);
  expect(Object.keys(ref)).not.toEqual(expect.arrayContaining(["name", "rating", "address"]));

  await expect(lake.getByText("On your board")).toBeVisible();

  // On the Board the idea carries the licensed photo's credit and a keyless "Open in Google Maps" link.
  await page.getByRole("radio", { name: "Board" }).click();
  const card = page.getByRole("article", { name: "Lake walk at dusk" });
  await expect(card.getByText("Photo: Dung Nguyen, CC BY-SA 4.0 · Wikimedia Commons")).toBeVisible();
  const link = card.getByRole("link", { name: "Open in Google Maps" });
  await expect(link).toHaveAttribute("href", /query_place_id=ChIJ-hoankiem001/);
  expect(await link.getAttribute("href")).not.toMatch(/key=/i);
});

test("owner: a reached monthly limit shows a calm notice and a way forward, not an error", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  const calls = await stubPlaces(page, { search: { status: 429, body: { error: "cap", message: "x" } } });
  await page.goto("/places?tab=discover");

  await expect(page.getByRole("heading", { name: "Suggestions are paused for this month" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /allowance is nearly used up/ })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0); // retrying cannot help
  await page.getByRole("button", { name: "Add an idea by hand" }).click();
  await expect(page.getByRole("dialog", { name: "Add ideas" })).toBeVisible();
  expect(calls.search).toBe(1);
});

test("owner: if Google can't be reached, say so plainly and let them retry", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  let fail = true;
  const calls = await stubPlaces(page);
  await page.route("**/api/places/search", (route) =>
    fail ? route.fulfill({ status: 502, json: { error: "unavailable", message: "x" } }) : route.fallback(),
  );
  await page.goto("/places?tab=discover");
  await expect(page.getByRole("heading", { name: "Couldn’t reach Google Maps" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t reach Google Maps" })).not.toContainText(
    /googleapis|key|PERMISSION/i,
  );
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("article", { name: "Hoan Kiem Lake" })).toBeVisible();
  expect(calls.search).toBe(1);
});

test("owner: the map view works without a Google key (drawn stand-in) and the list stays available", async ({
  page,
}) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await stubPlaces(page);
  await page.goto("/places?tab=discover");
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.getByText("Map unavailable here. Search still works.")).toBeVisible();
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page.getByRole("article", { name: "Hoan Kiem Lake" })).toBeVisible();
});

test("viewer: no Discover tab, no Google calls, but the saved photo, credit and Maps link", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  const attraction = fake.tables.get("attractions")!.find((a) => a.name === "Trang An Scenic Landscape Complex")!;
  fake.tables.set("place_refs", [
    {
      id: "pr1",
      trip_id: attraction.trip_id,
      item_table: "attractions",
      item_id: attraction.id,
      place_id: "ChIJ-hoankiem001",
      lat: 21.03,
      lng: 105.85,
      coords_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ]);
  fake.tables.set("item_images", [
    {
      id: "im1",
      trip_id: attraction.trip_id,
      item_table: "attractions",
      item_id: attraction.id,
      source: "wikimedia",
      url: WIKI.url,
      page_url: WIKI.pageUrl,
      credit: WIKI.author,
      license: WIKI.license,
      license_url: WIKI.licenseUrl,
      position: 0,
      created_at: new Date().toISOString(),
    },
  ]);
  await fake.install(page);
  const calls = await stubPlaces(page);
  await page.goto("/places?tab=discover"); // the tab does not exist for a viewer: it falls back to the Board

  await expect(page.getByRole("radio", { name: "Board" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Discover" })).toHaveCount(0);
  const card = page.getByRole("article", { name: String(attraction.name) });
  await expect(card.getByText("Photo: Dung Nguyen, CC BY-SA 4.0 · Wikimedia Commons")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
    "href",
    /query_place_id=ChIJ-hoankiem001/,
  );
  expect(calls).toEqual({ search: 0, image: 0, details: 0, photo: 0 });
});
