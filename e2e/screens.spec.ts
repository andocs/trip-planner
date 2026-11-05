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
