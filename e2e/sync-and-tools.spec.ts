import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { createFakeSupabase } from "./fake-supabase";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test("edits from another phone appear live", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/spend");
  await expect(page.getByText("PHP 14,478.08").first()).toBeVisible();
  await expect.poll(() => fake.realtimeJoined).toBe(true);

  const jam = fake.tables.get("travelers")!.find((t) => t.name === "Jam")!;
  fake.remoteChange("expenses", "INSERT", {
    id: "remote-1",
    trip_id: fake.trip.id as string,
    spent_on: "2026-06-19",
    description: "Banh mi from the other phone",
    category_id: null,
    paid_by: jam.id,
    currency: "VND",
    amount: 100000,
    note: null,
    created_at: new Date().toISOString(),
  });
  await expect(page.getByText("Banh mi from the other phone").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("PHP 14,723.78").first()).toBeVisible(); // + 100,000 × 0.002457

  fake.remoteChange("expenses", "UPDATE", { id: "remote-1", description: "Banh mi (edited)" });
  await expect(page.getByText("Banh mi (edited)").filter({ visible: true })).toBeVisible();

  fake.remoteChange("expenses", "DELETE", { id: "remote-1" });
  await expect(page.getByText("Banh mi (edited)")).toHaveCount(0);
  await expect(page.getByText("PHP 14,478.08").first()).toBeVisible();
});

test("invite link joins the trip; a bad link explains itself", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);

  // This person is already on a trip, so a link asks before adding another (a link cannot be previewed, so a bad one fails after the question).
  await page.goto("/join/not-a-token");
  await page.getByRole("button", { name: "Add this trip" }).click();
  await expect(page.getByRole("heading", { name: "This invite link doesn’t work" })).toBeVisible();

  await page.goto(`/join/${fake.trip.join_token}`);
  await page.getByRole("button", { name: "Add this trip" }).click();
  // Already signed in with Google, so nothing to offer: straight into the joined trip, at its own address.
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
});

test("a failed save rolls back with a message", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.route("**/rest/v1/packing_items?**", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "server down" }),
        })
      : route.fallback(),
  );
  await page.goto("/pack");
  const box = page.getByRole("checkbox", { name: "Packed: Passport (Jam)" });
  await box.click();
  await expect(page.getByText(/Couldn't save the packing item: server down/)).toBeVisible();
  await expect(box).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("0 of 40 packed")).toBeVisible();
});

test("export to Excel downloads the workbook tabs", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Vietnam 26.xlsx");
  const wb = XLSX.read(readFileSync(await file.path()));
  for (const name of ["Trip", "Budget", "Expenses", "Itinerary", "Flights", "Stays", "Food", "Attractions", "Packing"])
    expect(wb.SheetNames).toContain(name);
  const itinerary = XLSX.utils.sheet_to_json(wb.Sheets.Itinerary);
  expect(itinerary).toHaveLength(140);
});

test("add to calendar downloads an .ics with the trip's activities, flights and stays, and no booking numbers", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar (.ics)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Vietnam 26.ics");
  const ics = readFileSync(await file.path(), "utf8");
  expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
  expect(ics.split("BEGIN:VEVENT").length - 1).toBeGreaterThan(100);
  expect(ics).toContain("SUMMARY:Flight:");
  expect(ics).not.toMatch(/booking|confirmation/i);
});

test("download a backup (JSON) and the expenses (CSV), without secrets", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/settings");

  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a backup (JSON)" }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/^Vietnam 26 backup \d{4}-\d{2}-\d{2}\.json$/);
  const text = readFileSync(await file.path(), "utf8");
  const backup = JSON.parse(text);
  expect(backup).toMatchObject({ format: "trip-planner-backup", version: 2 });
  expect(backup.tables).not.toHaveProperty("stays"); // a stay is a booked hotel idea now
  expect(backup.tables.hotel_ideas.some((h: { is_stay?: boolean }) => h.is_stay === true)).toBe(true);
  expect(backup.tables.itinerary_items).toHaveLength(140);
  expect(text).not.toContain(fake.trip.join_token);
  expect(text).not.toContain("trip_id");

  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Expenses as CSV" }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe("Vietnam 26 expenses.csv");
  const csv = readFileSync(await file.path(), "utf8");
  expect(csv.startsWith("﻿Date,Description,Category,Paid by,Currency,Amount,Amount (PHP),Rate used,Note")).toBe(true);
});

test("restoring a backup into a trip that already has data is refused with a message", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a backup (JSON)" }).click();
  const file = await download;
  await page.getByLabel("Backup file").setInputFiles(await file.path());
  await expect(page.getByText(/already has data/)).toBeVisible();
});

test("start a new trip archives the old one and keeps travelers", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Start a new trip" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByLabel("Keep travelers, currencies and exchange rate")).toBeChecked();
  await dialog.getByRole("button", { name: "Archive and start new" }).click();

  // The old trip is archived and the owner lands in the setup wizard for the new one.
  await expect(page.getByRole("heading", { name: "Where are you going first?" })).toBeVisible();
  expect(fake.tables.get("travelers")).toHaveLength(2); // travelers carry over
});
