import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

/** One smoke path per role: blocked visitor, viewer (link), owner, plus the join and claim flows. */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test.describe("blocked visitor (no session, no invite)", () => {
  test("sees only Invite only, on every route, with no trip data", async ({ page }) => {
    await createFakeSupabase({ withSeed: true, role: "signedout" }).install(page);
    for (const path of ["/", "/spend", "/plan", "/places", "/pack", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Invite only" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Owner sign in" })).toBeVisible();
      await expect(page.getByText("Vietnam")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0); // no app chrome
    }
  });

  test("the sign-in page offers Google and nothing else", async ({ page }) => {
    await createFakeSupabase({ role: "signedout" }).install(page);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("an unknown invite link shows a clear error", async ({ page }) => {
    await createFakeSupabase({ role: "signedout" }).install(page);
    await page.goto("/join/not-a-token");
    await expect(page.getByRole("heading", { name: "This invite link doesn’t work" })).toBeVisible();
  });
});

test.describe("signed in without a trip", () => {
  test("sees No access and can sign out", async ({ page }) => {
    await createFakeSupabase({ role: "noaccess" }).install(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "No access yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a trip" })).toHaveCount(0);
  });
});

test.describe("viewer (joined with an invite link)", () => {
  test("opening the link joins as a viewer and lands on a read-only Home", async ({ page }) => {
    const fake = createFakeSupabase({ withSeed: true, role: "signedout" });
    await fake.install(page);
    await page.goto("/join/e2e-token");
    await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/); // the token is gone from the address bar
    expect(fake.role).toBe("viewer");
    await expect(page.getByRole("status").filter({ hasText: "View only" })).toBeVisible();
  });

  test("sees the plan but has no way to change anything", async ({ page }) => {
    await createFakeSupabase({ withSeed: true, role: "viewer" }).install(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quick add" })).toHaveCount(0);

    await page.goto("/spend");
    await expect(page.getByText("PHP 14,478.08").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add expense" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);

    await page.goto("/plan");
    await expect(page.getByRole("button", { name: /^Add\b/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0); // done ticks are display-only

    await page.goto("/pack");
    await expect(page.getByRole("button", { name: /^Add\b/ })).toHaveCount(0);
  });

  test("Settings is minimal: theme and account, no trip forms or invite link", async ({ page }) => {
    await createFakeSupabase({ withSeed: true, role: "viewer" }).install(page);
    await page.goto("/settings");
    await expect(page.getByText("Theme")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite link" })).toHaveCount(0);
    await expect(page.getByLabel("Trip name")).toHaveCount(0);
  });
});

test.describe("owner", () => {
  test("has every edit control", async ({ page }) => {
    await createFakeSupabase({ withSeed: true, role: "owner" }).install(page);
    await page.goto("/spend");
    await expect(page.getByRole("button", { name: "Add expense" })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Invite link" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Viewers" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "View only" })).toHaveCount(0);
  });

  test("claims a trip that was created before owners existed", async ({ page }) => {
    const fake = createFakeSupabase({ withSeed: true, role: "owner" });
    fake.claimable.push(fake.trip);
    await fake.install(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Claim this trip" })).toBeVisible();
    await page.getByRole("button", { name: "Claim this trip" }).click();
    await expect(page.getByRole("heading", { name: "Vietnam '26" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quick add" })).toBeVisible();
  });
});
