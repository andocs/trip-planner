import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("owner: add a stay with its details; the card shows the key facts", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places?cat=stay");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Add stay" });
  await modal.getByLabel("Name", { exact: true }).fill("Canal view hostel");
  await modal.getByLabel("Location or area").fill("Hoan Kiem");
  await modal.getByLabel("Price per night").fill("3800");
  await modal.getByLabel("Check-in day").fill("2");
  await modal.getByLabel("Check-out day").fill("5");
  await expect(modal.getByText("3 nights × PHP 3,800.00")).toBeVisible();
  await expect(modal.getByText("PHP 11,400.00", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Hostel" }).click();
  await modal.getByRole("button", { name: "Free", exact: true }).click();
  await modal.getByLabel("Free until day").fill("1");
  await modal.getByRole("button", { name: "Wifi" }).click();
  await modal.getByRole("switch", { name: /Breakfast included/ }).click();
  await modal.getByRole("button", { name: "Save draft" }).click();

  await expect.poll(() => fake.tables.get("hotel_ideas")?.find((h) => h.hotel === "Canal view hostel")).toBeTruthy();
  const row = fake.tables.get("hotel_ideas")!.find((h) => h.hotel === "Canal view hostel")!;
  expect(row).toMatchObject({ city: "Hoan Kiem", nights: 3, total: 11400, decision: "draft", deal_breaker: false });
  expect(row.details).toEqual({
    unit: "night",
    currency: "PHP",
    pricePerNight: 3800,
    stayType: "hostel",
    checkInDay: 2,
    checkOutDay: 5,
    cancellation: "free",
    freeUntilDay: 1,
    breakfast: true,
    amenities: ["Wifi"],
  });
  // No booking reference field exists on an idea: viewers can read ideas.
  expect(JSON.stringify(row)).not.toMatch(/booking_?ref|confirmation|pnr/i);

  const card = page.getByRole("article", { name: "Canal view hostel" });
  await expect(card.getByText("Free cancellation")).toBeVisible();
  await expect(card.getByText("3 nights · PHP 11,400.00")).toBeVisible();
});

test("owner: add a food place; switching category keeps the name; the must-do flag shows", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/places");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add stay" })).toBeVisible();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Name", { exact: true }).fill("Pho Gia Truyen");
  await modal.getByRole("radio", { name: "Food" }).click();
  await expect(page.getByRole("dialog", { name: "Add food" })).toBeVisible();
  await expect(modal.getByLabel("Name", { exact: true })).toHaveValue("Pho Gia Truyen");
  await modal.getByLabel("Price per person").fill("120");
  await modal.getByRole("button", { name: "Breakfast" }).click();
  await modal.getByRole("switch", { name: /Queue-prone/ }).click();
  await modal.getByRole("switch", { name: /Reservation needed/ }).click();
  await modal.getByRole("switch", { name: /Deal-breaker/ }).click();
  await modal.getByRole("button", { name: "Save draft" }).click();

  await expect.poll(() => fake.tables.get("food_places")?.find((f) => f.name === "Pho Gia Truyen")).toBeTruthy();
  const row = fake.tables.get("food_places")!.find((f) => f.name === "Pho Gia Truyen")!;
  expect(row).toMatchObject({ price: 120, deal_breaker: true, decision: "draft" });
  expect(row.details).toMatchObject({ unit: "person", mealSlots: ["breakfast"], queueProne: true, reservationNeeded: true });
  expect((row.details as Record<string, unknown>).reservationBooked).toBeUndefined();

  const card = page.getByRole("article", { name: "Pho Gia Truyen" });
  await expect(card.getByText("Must-do")).toBeVisible();
  await expect(card.getByText("Reservation needed")).toBeVisible(); // a booking still to do comes first
});

test("a name is required, and a bad number is refused", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/places?cat=sight");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Add sight" });
  await modal.getByRole("button", { name: "Save draft" }).click();
  await expect(modal.getByText("Name is required")).toBeVisible();
  await modal.getByLabel("Name", { exact: true }).fill("Cave");
  await modal.getByLabel("Entrance fee per person").fill("abc");
  await modal.getByRole("button", { name: "Save draft" }).click();
  await expect(modal.getByText("Enter a number")).toBeVisible();
  await modal.getByLabel("Entrance fee per person").fill("0"); // free is allowed
  await modal.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("dialog", { name: "Add sight" })).toHaveCount(0);
});

test("viewer: sees the facts, the must-do flag and the details, with no way to add or edit", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  const sight = fake.tables.get("attractions")!.find((a) => a.name === "One Pillar Pagoda")!;
  sight.deal_breaker = true;
  sight.details = { sightType: "culture", ticketsNeeded: true, duration: "1h", bestTimes: ["morning"] };
  await fake.install(page);
  await page.goto("/places?cat=sight");
  await page.getByRole("radio", { name: /^Confirmed/ }).click(); // the seeded pagoda is already confirmed

  const card = page.getByRole("article", { name: "One Pillar Pagoda" });
  await expect(card.getByText("Must-do")).toBeVisible();
  await expect(card.getByText("Book ahead")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "Open One Pillar Pagoda" }).click();
  const sheet = page.getByRole("dialog", { name: "One Pillar Pagoda" });
  await expect(sheet.getByRole("region", { name: "Details" })).toContainText("Needed in advance, not booked yet");
  await expect(sheet.getByRole("region", { name: "Details" })).toContainText("Morning");
  await expect(sheet.getByRole("button", { name: "Edit details" })).toHaveCount(0);
});
