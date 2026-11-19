import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

const TOKEN = "t".repeat(36);

test("owner: create a view-only link, replace it, then stop sharing", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await page.goto("/settings");

  await expect(page.getByLabel("View-only link")).toHaveCount(0);
  await page.getByRole("button", { name: "Create a view-only link" }).click();
  const input = page.getByLabel("View-only link");
  await expect(input).toHaveValue(/\/share\/e2e[0-9a-f]{33}$/);
  const first = fake.shareToken!;
  expect(await input.inputValue()).toContain(`/share/${first}`);

  const card = page.locator("section", { has: input }); // the invite section has a "New link" button too
  await card.getByRole("button", { name: "New link" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create new link" }).click();
  await expect.poll(() => fake.shareToken).not.toBe(first);
  await expect(input).toHaveValue(new RegExp(`/share/${fake.shareToken}$`));

  await card.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByRole("button", { name: "Create a view-only link" })).toBeVisible();
  expect(fake.shareToken).toBeNull();
});

test("a viewer or editor never sees the sharing controls", async ({ page }) => {
  await createFakeSupabase({ withSeed: true, role: "viewer" }).install(page);
  await page.goto("/settings");
  await expect(page.getByText("View-only link")).toHaveCount(0);
});

test("a visitor with no account sees the plan, and nothing private", async ({ page }) => {
  const fake = createFakeSupabase({ withSeed: true, role: "signedout", shareToken: TOKEN });
  await fake.install(page);
  await page.goto(`/share/${TOKEN}`);

  await expect(page.getByRole("heading", { name: "Vietnam '26", level: 1 })).toBeVisible();
  await expect(page.getByText("Shared view only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Itinerary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Flights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stays" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Day 1" })).toBeVisible();

  // No controls, no money, no references, no way into the app.
  await expect(page.getByRole("button")).toHaveCount(0);
  const html = await page.content();
  for (const private_ of ["118,165", "Budget", "Spent", "booking_ref", "join_token", "confirmation"]) expect(html).not.toContain(private_);
  expect(page.url()).toContain(`/share/${TOKEN}`); // not bounced to a sign-in or an invite-only page
});

test("a wrong or switched-off link says so plainly", async ({ page }) => {
  await createFakeSupabase({ withSeed: true, role: "signedout", shareToken: TOKEN }).install(page);
  await page.goto(`/share/${"x".repeat(36)}`);
  await expect(page.getByRole("heading", { name: "This link isn't active" })).toBeVisible();
  await expect(page.getByText("Vietnam '26")).toHaveCount(0);
});
