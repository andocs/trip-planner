import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

/** One smoke path per role: blocked visitor, viewer (link), owner, plus the join and claim flows. */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
});

test.describe("blocked visitor (no session, no invite)", () => {
  test("sees only Invite only, on every route, with no trip data", async ({ page }) => {
    await createFakeSupabase({ withSeed: true, role: "signedout" }).install(page);
    for (const path of ["/", "/spend", "/itinerary", "/stays", "/flights", "/places", "/pack", "/settings"]) {
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
    // A guest is offered Google first, and can go on without it.
    await expect(page.getByRole("heading", { name: "You’re in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
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

    await page.goto("/itinerary");
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
    await expect(page.getByRole("heading", { name: "Viewers" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "View only" })).toHaveCount(0);
  });

  test("Travelers show who joined with the link (Google or guest), and the owner can remove their access", async ({ page }) => {
    const fake = createFakeSupabase({ withSeed: true, role: "owner" });
    const tripId = fake.trip.id as string;
    fake.tables.set("trip_members", [
      { id: "m1", user_id: "u-google", role: "viewer", label: "Tita Rose", email: "rose@example.com", joined_at: "2026-06-01T00:00:00Z" },
      { id: "m2", user_id: "u-guest", role: "viewer", label: null, email: null, joined_at: "2026-06-02T00:00:00Z" },
    ]);
    fake.tables.set("travelers", [
      { id: "t1", trip_id: tripId, name: "Tita Rose", sort: 0, user_id: "u-google", created_at: "2026-06-01T00:00:00Z" },
      { id: "t2", trip_id: tripId, name: "Guest", sort: 1, user_id: "u-guest", created_at: "2026-06-02T00:00:00Z" },
    ]);
    await fake.install(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Viewers" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Tita Rose" })).toContainText("Google");
    await expect(page.getByRole("button", { name: "Edit Guest" })).toContainText("Guest");

    await page.getByRole("button", { name: "Edit Guest" }).click();
    await page.getByRole("dialog", { name: "Edit traveler" }).getByRole("button", { name: "Remove access" }).click();
    await expect.poll(() => fake.tables.get("trip_members")?.some((m) => m.user_id === "u-guest")).toBe(false);
    // The traveler stays; only the access went.
    expect(fake.tables.get("travelers")?.some((t) => t.id === "t2")).toBe(true);
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
