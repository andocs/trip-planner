import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test("an address that does not exist shows the not-found page, with a way back", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the trip" })).toBeVisible();
});
