import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("Planned is its own counter: allocations, grown by flights and stays that are in the plan", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  // A controlled plan: Flights has a 10,000 allocation, and one booked flight costs 30,000 (the rest are cancelled).
  const cats = fake.tables.get("categories")!;
  const flightsCat = cats.find((c) => c.name === "Flights")!;
  const staysCat = cats.find((c) => c.name === "Accommodation")!;
  flightsCat.planned = 10000;
  staysCat.planned = 20000;
  fake.tables
    .get("flights")!
    .forEach((f, i) => Object.assign(f, { fare: i === 0 ? 30000 : 5000, status: i === 0 ? "Booked" : "Cancelled" }));
  fake.stayRows().forEach((s) => Object.assign(s, { total: 99999, stay_status: "Idea" })); // ideas are not in the plan
  const others = cats.filter((c) => c !== flightsCat && c !== staysCat).reduce((s, c) => s + Number(c.planned ?? 0), 0);
  await fake.install(page);
  await page.goto("/");

  // Flights: max(10,000 allocated, 30,000 booked) = 30,000. Stays: the 20,000 allocation (the stays are only ideas).
  const expected = others + 30000 + 20000;
  await expect(page.getByText(`Planned ${Math.round(expected).toLocaleString("en-US")} of 118,165`)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Budget planned" })).toBeVisible();
  // Real money is separate: Spent and Left do not move with the plan.
  await expect(page.getByText("12% used.")).toBeVisible();
});

test("a plan over the budget says so, and Left still means real money", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("categories")!.find((c) => c.name === "Flights")!.planned = 500000;
  await fake.install(page);
  await page.goto("/");
  await expect(page.getByText(/over budget\./)).toBeVisible();
  await expect(page.getByText("12% used.")).toBeVisible();
});

test("owner: Log as expense turns a booked flight into one linked expense, once", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("flights")!.forEach((f) => (f.status = "Booked"));
  fake.stayRows().forEach((x) => (x.stay_status = "Booked"));
  await fake.install(page);
  await page.goto("/flights");

  const first = fake.tables.get("flights")!.find((f) => f.fare && Number(f.fare) > 0)!;
  const before = fake.tables.get("expenses")!.length;
  await page.getByRole("button", { name: "Log as expense" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Log as expense" });
  await expect(sheet.getByLabel("Description")).toHaveValue(/^Flight /);
  await expect(sheet.getByLabel(/^Amount/)).toHaveValue(String(first.fare));
  await expect(sheet.getByLabel("Category")).toHaveValue(
    String(fake.tables.get("categories")!.find((c) => c.name === "Flights")!.id),
  );
  await sheet.getByRole("button", { name: "Log expense" }).click();

  await expect.poll(() => fake.tables.get("expenses")!.length).toBe(before + 1);
  const added = fake.tables.get("expenses")!.find((e) => e.source_id);
  expect(added).toMatchObject({ source_table: "flights", amount: first.fare, currency: "PHP" });
  expect(String(added!.source_id).length).toBeGreaterThan(5);
  // The booking now says Logged and the button is gone for that flight (it cannot be logged twice).
  await expect(page.getByRole("link", { name: /Logged/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Log as expense" })).toHaveCount(
    fake.tables.get("flights")!.filter((f) => f.fare && Number(f.fare) > 0).length - 1,
  );

  // Spent on Home rose by exactly that amount.
  await page.goto("/");
  await expect(page.getByText(/% used\./)).toBeVisible();
});

test("owner: a stay can be logged too, under Accommodation", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("flights")!.forEach((f) => (f.status = "Booked"));
  fake.stayRows().forEach((x) => (x.stay_status = "Booked"));
  await fake.install(page);
  await page.goto("/stays");
  await page.getByRole("button", { name: "Log as expense" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Log as expense" });
  await expect(sheet.getByLabel("Description")).toHaveValue(/^Stay: /);
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect.poll(() => fake.tables.get("expenses")!.some((e) => e.source_table === "hotel_ideas")).toBe(true);
  await expect(page.getByRole("link", { name: /Logged/ })).toHaveCount(1);
});

test("owner: the form won't log an empty amount", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.get("flights")!.forEach((f) => (f.status = "Booked"));
  fake.stayRows().forEach((x) => (x.stay_status = "Booked"));
  await fake.install(page);
  await page.goto("/flights");
  await page.getByRole("button", { name: "Log as expense" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Log as expense" });
  const before = fake.tables.get("expenses")!.length;
  await sheet.getByLabel(/^Amount/).fill("");
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect(sheet.getByText(/Amount is required|required/i)).toBeVisible();
  await sheet.getByLabel(/^Amount/).fill("0");
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect(sheet.getByText(/can.t be zero/i)).toBeVisible();
  expect(fake.tables.get("expenses")!.length).toBe(before); // nothing was logged
  await sheet.getByLabel(/^Amount/).fill("1,234.50");
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect.poll(() => fake.tables.get("expenses")!.length).toBe(before + 1);
});

test("viewer: sees which bookings are logged, but never a Log button", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  const flight = fake.tables.get("flights")!.find((f) => f.fare && Number(f.fare) > 0)!;
  fake.tables.get("expenses")!.push({
    id: "e-linked",
    trip_id: flight.trip_id,
    description: "Flight",
    amount: flight.fare,
    currency: "PHP",
    category_id: null,
    paid_by: null,
    spent_on: "2026-06-01",
    note: null,
    created_at: "2026-06-01T00:00:00Z",
    source_table: "flights",
    source_id: flight.id,
  });
  await fake.install(page);
  await page.goto("/flights");
  await expect(page.getByRole("link", { name: /Logged/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Log as expense" })).toHaveCount(0);
});

test("the nights counter flips up when it goes up and down when it goes down, and not on load", async ({ page }) => {
  await page.route("**/api/geocode**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const hanoi = {
      lat: 21.0285,
      lng: 105.8542,
      label: "Hanoi, Vietnam",
      name: "Hanoi",
      country: "Vietnam",
      countryCode: "VN",
    };
    return route.fulfill({
      json: q.has("lat") ? hanoi : { results: (q.get("q") ?? "").toLowerCase().startsWith("ha") ? [hanoi] : [] },
    });
  });
  const fake = createFakeSupabase({ noTrip: true });
  await fake.install(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a city or place" }).fill("Hano");
  await page.getByRole("option", { name: "Hanoi" }).click();
  await page.getByRole("button", { name: "Add this stop" }).click();
  await expect(page.getByRole("heading", { name: "How many nights in each?" })).toBeVisible();

  const flips = page.locator(".board-flip-up, .board-flip-down");
  await expect(flips).toHaveCount(0); // nothing animates when the screen opens
  await page.getByRole("button", { name: "More nights in Hanoi" }).click();
  await expect(page.locator(".board-flip-up")).toHaveCount(1);
  await expect(page.locator(".board-flip-down")).toHaveCount(0);
  await page.getByRole("button", { name: "Fewer nights in Hanoi" }).click();
  await expect(page.locator(".board-flip-down")).toHaveCount(1);
  await expect(page.locator(".board-flip-up")).toHaveCount(0);
});

test("with reduced motion the digits change without an animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/geocode**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const hanoi = {
      lat: 21.0285,
      lng: 105.8542,
      label: "Hanoi, Vietnam",
      name: "Hanoi",
      country: "Vietnam",
      countryCode: "VN",
    };
    return route.fulfill({
      json: q.has("lat") ? hanoi : { results: (q.get("q") ?? "").toLowerCase().startsWith("ha") ? [hanoi] : [] },
    });
  });
  await createFakeSupabase({ noTrip: true }).install(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a city or place" }).fill("Hano");
  await page.getByRole("option", { name: "Hanoi" }).click();
  await page.getByRole("button", { name: "Add this stop" }).click();
  await page.getByRole("button", { name: "More nights in Hanoi" }).click();
  const animated = page.locator(".board-flip-up").first();
  await expect(animated).toHaveCount(1);
  expect(await animated.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
