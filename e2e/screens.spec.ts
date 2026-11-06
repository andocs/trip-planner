import { test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

/** Not a test: captures screenshots of each screen for visual review. Run: npx playwright test screens */
test.describe("screens", () => {
  test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");

  for (const theme of ["light", "dark"] as const) {
    test(`capture ${theme}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
      await page.addInitScript((t) => localStorage.setItem("tp-theme", t), theme);
      await createFakeSupabase({ withSeed: true }).install(page);
      for (const path of [
        "/",
        "/spend",
        "/settings",
        "/plan",
        "/plan?tab=flights",
        "/plan?tab=stays",
        "/plan?tab=ideas",
        "/places",
        "/places?tab=attractions",
        "/pack",
        "/pack?tab=gifts",
        "/pack?tab=reminders",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2500);
        const name = path === "/" ? "home" : path.slice(1).replace(/[?=]/g, "-");
        await page.screenshot({
          path: `e2e/screens/${name}-${theme}.png`,
          fullPage: !["/plan", "/pack", "/places"].includes(path),
        });
      }
      await page.goto("/places");
      await page.getByRole("button", { name: /^Menu for Bun Cha Ta/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/screens/food-menu-${theme}.png` });

      await page.goto("/spend");
      await page.getByRole("button", { name: "Add expense" }).click();
      await page.getByRole("dialog").getByRole("radio", { name: "VND" }).click();
      await page.getByRole("dialog").getByLabel("Amount").fill("80000");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `e2e/screens/expense-sheet-${theme}.png` });
    });
  }
});

/** Desktop (≥1024px: left rail, dialogs). Same switch: SCREENS=1. */
test.describe("screens desktop", () => {
  test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  for (const theme of ["light", "dark"] as const) {
    test(`capture desktop ${theme}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
      await page.addInitScript((t) => localStorage.setItem("tp-theme", t), theme);
      await createFakeSupabase({ withSeed: true }).install(page);
      for (const path of ["/", "/spend", "/plan", "/places", "/pack", "/settings"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2500);
        const name = path === "/" ? "home" : path.slice(1);
        await page.screenshot({ path: `e2e/screens/desktop-${name}-${theme}.png` });
      }
      await page.goto("/spend");
      await page.getByRole("button", { name: "Add expense" }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `e2e/screens/desktop-expense-dialog-${theme}.png` });
    });
  }
});

/** Access pages and the viewer's read-only screens (phone + desktop, light + night). */
for (const [label, viewport] of [
  ["mobile", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 800 }],
] as const) {
  test.describe(`screens access ${label}`, () => {
    test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");
    test.use({ viewport, isMobile: label === "mobile", hasTouch: label === "mobile" });

    for (const theme of ["light", "dark"] as const) {
      test(`capture ${label} ${theme}`, async ({ page }) => {
        await page.clock.setFixedTime(new Date("2026-06-10T09:00:00"));
        await page.addInitScript((t) => localStorage.setItem("tp-theme", t), theme);
        const shot = (name: string) => page.screenshot({ path: `e2e/screens/access-${name}-${label}-${theme}.png` });

        await createFakeSupabase({ role: "signedout" }).install(page);
        await page.goto("/");
        await page.waitForTimeout(600);
        await shot("invite-only");
        await page.goto("/login");
        await page.waitForTimeout(400);
        await shot("login");

        const noAccess = createFakeSupabase({ role: "noaccess" });
        await page.context().clearCookies();
        await noAccess.install(page);
        await page.goto("/");
        await page.waitForTimeout(800);
        await shot("no-access");

        const claim = createFakeSupabase({ withSeed: true, role: "owner" });
        claim.claimable.push(claim.trip);
        await page.context().clearCookies();
        await claim.install(page);
        await page.goto("/");
        await page.waitForTimeout(800);
        await shot("claim");

        const viewer = createFakeSupabase({ withSeed: true, role: "viewer" });
        await page.context().clearCookies();
        await viewer.install(page);
        for (const path of ["/", "/plan", "/settings"]) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(2200);
          await shot(`viewer-${path === "/" ? "home" : path.slice(1)}`);
        }
      });
    }
  });
}
