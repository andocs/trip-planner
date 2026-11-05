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
  await expect(page.getByText("Banh mi from the other phone")).toBeVisible();
  await expect(page.getByText("PHP 14,723.78").first()).toBeVisible(); // + 100,000 × 0.002457

  fake.remoteChange("expenses", "UPDATE", { id: "remote-1", description: "Banh mi (edited)" });
  await expect(page.getByText("Banh mi (edited)")).toBeVisible();

  fake.remoteChange("expenses", "DELETE", { id: "remote-1" });
  await expect(page.getByText("Banh mi (edited)")).toHaveCount(0);
  await expect(page.getByText("PHP 14,478.08").first()).toBeVisible();
});

test("invite link joins the trip; a bad link explains itself", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);

  await page.goto("/join/not-a-token");
  await expect(page.getByRole("heading", { name: "This invite link doesn’t work" })).toBeVisible();

  await page.goto(`/join/${fake.trip.join_token}`);
  await expect(page).toHaveURL(/\/$/);
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

test("start a new trip archives the old one and keeps travelers", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Start a new trip" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByLabel("Keep travelers, currencies and exchange rate")).toBeChecked();
  await dialog.getByRole("button", { name: "Archive and start new" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "My Trip" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Travelers" }).getByRole("listitem")).toHaveCount(2);
  await page.goto("/spend");
  await expect(page.getByText("No expenses yet", { exact: true })).toBeVisible();
});
