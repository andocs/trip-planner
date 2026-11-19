import { deflateSync, crc32 } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

const CARD = "Trang An Scenic Landscape Complex"; // a seeded draft sight

/** A real PNG of a given size (noisy, so it is big before it is shrunk). */
function makePng(w: number, h: number): Buffer {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    rows[o] = 0;
    for (let x = 0; x < w * 3; x++) rows[o + 1 + x] = (x * 7 + y * 13 + ((x * y) % 251)) & 255;
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PIXEL = makePng(2, 2);

/** The width and height of the first JPEG inside a request body (multipart or not). */
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (start < 0) return null;
  let i = start + 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

type Stub = { linkCalls: number; uploads: { w: number; h: number; bytes: number }[] };
async function stubPhotos(
  page: Page,
  fake: ReturnType<typeof createFakeSupabase>,
  link?: { status: number; body: unknown },
) {
  const calls: Stub = { linkCalls: 0, uploads: [] };
  await page.route("**/api/photos/link", (route) => {
    calls.linkCalls++;
    return route.fulfill(
      link
        ? { status: link.status, json: link.body }
        : {
            json: {
              found: {
                imageUrl: "https://cdn.example.com/room.png",
                pageUrl: "https://www.booking.com/hotel/vn/x.html",
                site: "booking.com",
              },
            },
          },
    );
  });
  // Every picture host is stubbed: the tests never touch the network.
  for (const host of ["**/cdn.example.com/**", "**/upload.wikimedia.org/**"])
    await page.route(host, (route) => route.fulfill({ body: PIXEL, contentType: "image/png" }));
  await page.route("**/cdn.broken.example/**", (route) => route.abort());
  // A signed link, once opened, is a picture.
  await page.route("**/storage/v1/object/sign/trip-photos/**", (route) =>
    route.request().method() === "GET" ? route.fulfill({ body: PIXEL, contentType: "image/png" }) : route.fallback(),
  );
  // Record what an upload really sends (its size after shrinking), then let the fake accept it.
  await page.route("**/storage/v1/object/trip-photos/**", (route) => {
    const body = route.request().postDataBuffer();
    const dims = body ? jpegSize(body) : null;
    calls.uploads.push({ w: dims?.w ?? 0, h: dims?.h ?? 0, bytes: body?.length ?? 0 });
    return route.fallback();
  });
  void fake;
  return calls;
}

const idOf = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.tables.get("attractions")!.find((a) => a.name === CARD)!;
const seedImage = (fake: ReturnType<typeof createFakeSupabase>, over: Record<string, unknown>) => {
  const a = idOf(fake);
  const rows = fake.tables.get("item_images") ?? [];
  fake.tables.set("item_images", [
    ...rows,
    {
      id: `im${rows.length + 1}`,
      trip_id: a.trip_id,
      item_table: "attractions",
      item_id: a.id,
      position: rows.length,
      created_at: `2026-06-0${rows.length + 1}T00:00:00Z`,
      credit: null,
      license: null,
      license_url: null,
      page_url: null,
      storage_path: null,
      url: null,
      ...over,
    },
  ]);
};
const openSheet = async (page: Page) => {
  await page
    .getByRole("button", { name: `Open ${CARD}` })
    .first()
    .click();
  return page.getByRole("dialog", { name: CARD });
};

test("owner: paste a link, see the picture, add it with a credit", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  const calls = await stubPhotos(page, fake);
  await page.goto("/places");

  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByLabel("Page or picture link").fill("https://www.booking.com/hotel/vn/old-quarter-boutique.html");
  await add.getByRole("button", { name: "Find photo" }).click();
  await expect(add.getByText("Found a picture on booking.com")).toBeVisible();
  await expect(add.getByLabel("Credit (optional)")).toHaveValue("booking.com");
  await expect(add.getByText(/We keep the link to the picture, not a copy/)).toBeVisible();
  await add.getByRole("button", { name: "Add photo" }).click();

  await expect.poll(() => fake.tables.get("item_images")?.length).toBe(1);
  expect(fake.tables.get("item_images")![0]).toMatchObject({
    item_table: "attractions",
    item_id: idOf(fake).id,
    source: "link",
    url: "https://cdn.example.com/room.png",
    page_url: "https://www.booking.com/hotel/vn/x.html",
    credit: "booking.com",
    position: 0,
  });
  expect(calls.linkCalls).toBe(1);

  // The card now has a cover that says where it came from. Escape closes the TOPMOST dialog, so wait for the
  // "Add a photo" one to finish closing first, or on a slow machine Escape closes it and the place sheet stays open.
  await expect(add).toBeHidden();
  await page.keyboard.press("Escape");
  const card = page.getByRole("article", { name: CARD });
  await expect(card.getByRole("img", { name: `Photo of ${CARD}` })).toBeVisible();
  await expect(card.getByText("Photo from booking.com")).toBeVisible();
});

test("owner: a link that can't be used explains why and offers the alternatives", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await stubPhotos(page, fake, {
    status: 422,
    body: {
      error: "blocked_address",
      message: "That address can't be opened. Private and internal addresses are blocked.",
    },
  });
  await page.goto("/places");

  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByLabel("Page or picture link").fill("https://192.168.1.20/rooms/201");
  await add.getByRole("button", { name: "Find photo" }).click();
  await expect(add.getByRole("heading", { name: "Couldn’t get a picture from that link" })).toBeVisible();
  await expect(add.getByText("Private and internal addresses are blocked.").first()).toBeVisible();
  await add.getByRole("button", { name: "Upload a file" }).click();
  await expect(add.getByRole("button", { name: /Choose a photo/ })).toBeVisible();
  expect(fake.tables.get("item_images") ?? []).toHaveLength(0);
});

test("owner: an upload is shrunk to 1280 px before it leaves the phone, then shown with a signed link", async ({
  page,
}) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  const calls = await stubPhotos(page, fake);
  await page.goto("/places");

  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByRole("radio", { name: "Upload" }).click();
  await expect(add.getByText("38 MB of 1 GB")).toBeVisible();
  const big = makePng(2400, 1800);
  await add.locator("input[type=file]").setInputFiles({ name: "room-201.png", mimeType: "image/png", buffer: big });

  await expect.poll(() => fake.storage.uploads.length).toBe(1);
  await expect.poll(() => fake.tables.get("item_images")?.length).toBe(1);
  const tripId = String(idOf(fake).trip_id);
  const row = fake.tables.get("item_images")![0];
  expect(row).toMatchObject({ source: "upload", item_id: idOf(fake).id, position: 0 });
  expect(row.url ?? null).toBeNull();
  expect(String(row.storage_path)).toMatch(new RegExp(`^${tripId}/[0-9a-f-]{36}\\.jpg$`));
  expect(fake.storage.uploads[0].path).toBe(row.storage_path);
  // Shrunk: the longer side is 1280, the shape is kept, and it is smaller than what was chosen.
  expect(calls.uploads[0].w).toBe(1280);
  expect(calls.uploads[0].h).toBe(960);
  expect(calls.uploads[0].bytes).toBeLessThan(big.length);

  await expect(add).toBeHidden(); // see the note in the link test: Escape closes the topmost dialog
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: CARD }).getByRole("img", { name: `Photo of ${CARD}` })).toBeVisible();
  await expect(page.getByRole("article", { name: CARD }).getByText("Uploaded")).toBeVisible();
});

test("owner: a file that isn't a photo is refused before anything uploads", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await stubPhotos(page, fake);
  await page.goto("/places");
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByRole("radio", { name: "Upload" }).click();
  await add
    .locator("input[type=file]")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("That file isn't a JPEG, PNG or WebP photo.")).toBeVisible();
  expect(fake.storage.uploads).toHaveLength(0);
  expect(fake.tables.get("item_images") ?? []).toHaveLength(0);
});

test("owner: when photo storage is full, uploads are off and a link is offered instead", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.storage.used = 962 * 1024 * 1024; // past the 900 MB cap
  await fake.install(page);
  await stubPhotos(page, fake);
  await page.goto("/places");
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByRole("radio", { name: "Upload" }).click();
  await expect(add.getByRole("heading", { name: "Photo storage is almost full" })).toBeVisible();
  await expect(add.getByRole("button", { name: /Choose a photo/ })).toBeDisabled();
  await add.getByRole("button", { name: "Use a link instead" }).click();
  await expect(add.getByLabel("Page or picture link")).toBeVisible();
});

test("owner: refused by the database (full or not allowed) says so and leaves nothing behind", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.storage.reject = true;
  await fake.install(page);
  await stubPhotos(page, fake);
  await page.goto("/places");
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Add a photo" }).click();
  const add = page.getByRole("dialog", { name: "Add a photo" });
  await add.getByRole("radio", { name: "Upload" }).click();
  await add
    .locator("input[type=file]")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: makePng(200, 100) });
  await expect(page.getByText(/Photo storage is full, or you can't add photos here/)).toBeVisible();
  expect(fake.tables.get("item_images") ?? []).toHaveLength(0);
});

test("owner: make another photo the cover, then remove one (an upload's file goes too)", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const tripId = String(idOf(fake).trip_id);
  const path = `${tripId}/11111111-1111-1111-1111-111111111111.jpg`;
  seedImage(fake, { source: "link", url: "https://cdn.example.com/a.png", credit: "booking.com" });
  seedImage(fake, { source: "upload", storage_path: path });
  seedImage(fake, {
    source: "wikimedia",
    url: "https://upload.wikimedia.org/wikipedia/commons/x.jpg",
    page_url: "https://commons.wikimedia.org/wiki/File:x.jpg",
    credit: "A. Author",
    license: "CC BY-SA 4.0",
  });
  await fake.install(page);
  await stubPhotos(page, fake);
  await page.goto("/places");

  await expect(page.getByRole("article", { name: CARD }).getByText("Photos: 3")).toBeVisible();
  const sheet = await openSheet(page);
  await expect(sheet.getByText("Photo from booking.com")).toBeVisible();
  const order = () =>
    fake.tables
      .get("item_images")!
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((r) => r.source);

  await sheet.getByRole("button", { name: "Make Wikimedia photo the cover" }).click();
  await expect.poll(order).toEqual(["wikimedia", "link", "upload"]);
  await expect(sheet.getByText("Photo: A. Author, CC BY-SA 4.0 · Wikimedia Commons")).toBeVisible();
  await expect(sheet.getByRole("link", { name: "View on Wikimedia Commons" })).toHaveAttribute(
    "href",
    "https://commons.wikimedia.org/wiki/File:x.jpg",
  );

  await sheet.getByRole("button", { name: "Remove Photo 3" }).click();
  await expect.poll(() => fake.tables.get("item_images")!.length).toBe(2);
  await expect.poll(() => fake.storage.removed).toEqual([path]);
  await expect.poll(order).toEqual(["wikimedia", "link"]);
});

test("a photo that can't load shows a calm placeholder, not a broken image", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  seedImage(fake, { source: "link", url: "https://cdn.broken.example/gone.jpg", credit: "old-site.com" });
  await fake.install(page);
  await stubPhotos(page, fake);
  await page.goto("/places");
  const card = page.getByRole("article", { name: CARD });
  await card.scrollIntoViewIfNeeded(); // pictures load lazily, as the user scrolls
  await expect(card.getByRole("img", { name: "Photo unavailable" })).toBeVisible();
  await expect(card.getByText("Photo from old-site.com")).toBeVisible();
});

test("viewer: sees the photos and credits, with no way to add, change or remove", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  seedImage(fake, {
    source: "link",
    url: "https://cdn.example.com/a.png",
    credit: "booking.com",
    page_url: "https://www.booking.com/hotel/x",
  });
  seedImage(fake, {
    source: "wikimedia",
    url: "https://upload.wikimedia.org/wikipedia/commons/x.jpg",
    page_url: "https://commons.wikimedia.org/wiki/File:x.jpg",
    credit: "A. Author",
    license: "CC0",
  });
  await fake.install(page);
  const calls = await stubPhotos(page, fake);
  await page.goto("/places");

  const card = page.getByRole("article", { name: CARD });
  await expect(card.getByRole("img", { name: `Photo of ${CARD}` })).toBeVisible();
  await expect(card.getByText("Photos: 2")).toBeVisible();
  const sheet = await openSheet(page);
  await expect(sheet.getByRole("link", { name: "Open the original page" })).toBeVisible();
  await sheet.getByRole("button", { name: "Show photo 2" }).click();
  await expect(sheet.getByText("Photo: A. Author, CC0 · Wikimedia Commons")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Add a photo|Make .* the cover|Remove/ })).toHaveCount(0);
  expect(calls.linkCalls).toBe(0);
  expect(fake.storage.uploads).toHaveLength(0);
});
