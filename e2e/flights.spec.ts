import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("a flight is a boarding pass, and the next-day landing shows +1", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  const pass = page.getByRole("article", { name: /^MNL to HAN/ });
  await expect(pass).toBeVisible();
  await expect(pass).toContainText("22:20");
  await expect(pass).toContainText("+1");
  await expect(pass.getByText("Terminal")).toBeVisible();
  await expect(pass.getByText("Gate")).toBeVisible();
  await expect(pass.getByText("Seat")).toBeVisible();
});

test("details and the booking reference save; the reference goes to its own table", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await page.getByRole("button", { name: /^MNL to HAN.*Edit$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Edit flight" });
  await sheet.getByLabel("Terminal").fill("3");
  await sheet.getByLabel("Gate").fill("B7");
  await sheet.getByLabel("Seat").fill("14A");
  await sheet.getByLabel("Flight time (optional)").fill("3h 40m");
  await sheet.getByLabel("Booking reference").fill("QX7K2P");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => fake.tables.get("flights")?.find((f) => f.from_code === "MNL")?.gate).toBe("B7");
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  expect(flight.duration_min).toBe(220);
  expect(flight.booking_ref).toBeNull(); // never written back to the flight row
  await expect
    .poll(() => fake.tables.get("flight_refs")?.find((r) => r.flight_id === flight.id)?.booking_ref)
    .toBe("QX7K2P");
  await expect(page.getByRole("article", { name: /^MNL to HAN/ })).toContainText("QX7K2P");
  await expect(page.getByRole("article", { name: /^MNL to HAN/ })).toContainText("3h 40m");
});

test("a flight time that can't be read is refused", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await page.getByRole("button", { name: /^MNL to HAN.*Edit$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Edit flight" });
  await sheet.getByLabel("Flight time (optional)").fill("soon");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Use a format like 3h 40m")).toBeVisible();
});

test("a viewer sees the reference hidden, and the real one never reaches the page", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "viewer" });
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  fake.tables.set("flight_refs", [
    { id: "fr1", flight_id: flight.id, booking_ref: "SECRET9", created_at: "2026-06-01T00:00:00Z" },
  ]);
  fake.tables.set(
    "flights",
    fake.tables.get("flights")!.map((f) => (f.id === flight.id ? { ...f, has_ref: true, booking_ref: null } : f)),
  );
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  const pass = page.getByRole("article", { name: /^MNL to HAN/ });
  await expect(pass.getByLabel("Hidden for viewers")).toBeVisible();
  await expect(pass.getByText("Only the owner can see this.")).toBeVisible();
  expect(await page.content()).not.toContain("SECRET9");
  await expect(page.getByRole("button", { name: /^MNL to HAN.*Edit$/ })).toHaveCount(0);
});

test("an old reference still in the flight row moves to the owner-only table on save", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  fake.tables.set(
    "flights",
    fake.tables.get("flights")!.map((f) => (f.id === flight.id ? { ...f, booking_ref: "OLD123" } : f)),
  );
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await expect(page.getByRole("article", { name: /^MNL to HAN/ })).toContainText("OLD123");
  await page.getByRole("button", { name: /^MNL to HAN.*Edit$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Edit flight" });
  await expect(sheet.getByLabel("Booking reference")).toHaveValue("OLD123");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => fake.tables.get("flight_refs")?.find((r) => r.flight_id === flight.id)?.booking_ref)
    .toBe("OLD123");
  expect(fake.tables.get("flights")!.find((f) => f.id === flight.id)!.booking_ref).toBeNull();
});

test("deleting a flight removes its reference", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  fake.tables.set("flight_refs", [
    { id: "fr1", flight_id: flight.id, booking_ref: "GONE11", created_at: "2026-06-01T00:00:00Z" },
  ]);
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await page.getByRole("button", { name: /^MNL to HAN.*Edit$/ }).click();
  await page.getByRole("dialog", { name: "Edit flight" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => fake.tables.get("flights")?.some((f) => f.id === flight.id)).toBe(false);
  expect(fake.tables.get("flight_refs")!.length).toBe(0);
});

test("a booked flight can be logged as an expense once", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  const flight = fake.tables.get("flights")!.find((f) => f.from_code === "MNL")!;
  fake.tables.set(
    "flights",
    fake.tables.get("flights")!.map((f) => (f.id === flight.id ? { ...f, status: "Booked", fare: 5000 } : f)),
  );
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await page
    .getByRole("article", { name: /^MNL to HAN/ })
    .getByRole("button", { name: /Log as expense/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Log|Add|Save)/ })
    .last()
    .click();
  await expect
    .poll(
      () =>
        fake.tables.get("expenses")?.filter((e) => e.source_table === "flights" && e.source_id === flight.id).length,
    )
    .toBe(1);
});

test("with no flights there is an empty state", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  fake.tables.set("flights", []);
  await fake.install(page);
  await page.goto("/plan?tab=flights");
  await expect(page.getByRole("heading", { name: "No flights yet" })).toBeVisible();
});
