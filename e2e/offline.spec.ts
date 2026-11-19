import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

// The one spec that runs WITH the service worker (the config blocks it everywhere else).
test.use({ serviceWorkers: "allow" });

/** True once the app has written its saved copy of the trip to IndexedDB. */
const savedCopy = (page: Page) =>
  page.evaluate(
    () =>
      // Looking must never create the database: opening a missing one makes an empty copy the app then has to repair.
      indexedDB.databases().then(
        (dbs) =>
          new Promise<boolean>((resolve) => {
            if (!dbs.some((d) => d.name === "trip-planner-offline")) return resolve(false);
            const open = indexedDB.open("trip-planner-offline");
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              try {
                const get = db.transaction("kv").objectStore("kv").get("query-cache");
                get.onsuccess = () => {
                  db.close(); // an open connection would hold up the app's own upgrade of this database
                  resolve(!!get.result);
                };
                get.onerror = () => {
                  db.close();
                  resolve(false);
                };
              } catch {
                db.close();
                resolve(false);
              }
            };
          }),
      ),
  );

/**
 * Cuts the connection. Playwright answers requests to the fake Supabase from its own route handler even when the browser is
 * "offline", so the fake is told to refuse them too: otherwise the test could not tell the saved copy from a live answer.
 */
async function goOffline(page: Page, context: BrowserContext) {
  await context.setOffline(true);
  await page.route(/fake.supabase.test/, (route) => route.abort("internetdisconnected"));
}

/** Loads a screen online until the worker controls the page and has kept a copy of it and of the data. */
async function prepare(page: Page, path: string, marker: RegExp | string) {
  await page.goto(path);
  await expect(page.getByText(marker).first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // The first visit predates the worker, so that page itself was not kept: visit again through the worker.
  await page.reload();
  await expect(page.getByText(marker).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => savedCopy(page), { timeout: 20_000 }).toBe(true);
}

test("offline: the app opens, shows the last saved plan, and says changes can't be saved", async ({ page, context }) => {
  const fake = createFakeSupabase({ withSeed: true });
  await fake.install(page);
  await prepare(page, "/itinerary", "0 of 140 done");
  await expect(page.getByText("You're offline")).toHaveCount(0);

  await goOffline(page, context);
  await page.reload();

  // The saved page and the saved data are on screen, with the banner.
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();
  await expect(page.getByText(/Changes can't be saved until you're back online/)).toBeVisible();

  // A change made offline fails at once with a plain message, and nothing is half-saved.
  await page.getByRole("button", { name: /\. Menu$/ }).first().click();
  await page.getByRole("menuitem", { name: "Mark complete" }).click();
  await expect(page.getByText(/You're offline, so this couldn't be saved/).first()).toBeVisible();
  await expect(page.getByText("0 of 140 done")).toBeVisible();
  expect(fake.tables.get("itinerary_items")!.some((i) => i.done === true)).toBe(false);

  // Back online: the banner goes away.
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toHaveCount(0);
});

test("offline: a screen that was never saved explains itself instead of showing a browser error", async ({ page, context }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await prepare(page, "/itinerary", "0 of 140 done");
  await goOffline(page, context);
  await page.goto("/pack");
  await expect(page.getByRole("heading", { name: /You.re offline/ })).toBeVisible();
  await expect(page.getByText(/hasn.t been saved on this device yet/)).toBeVisible();
});

test("signing out deletes what was saved on the device", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await prepare(page, "/itinerary", "0 of 140 done");
  expect(await page.evaluate(() => caches.keys().then((k) => k.some((n) => n.startsWith("tp-"))))).toBe(true);

  // The real sign-out path runs clearOfflineData before the session goes.
  await page.goto("/settings");
  await page.getByRole("button", { name: /sign out/i }).first().click();
  // Signing out ends with a page navigation (so a check can land mid-navigation: retry it), then nothing may be left.
  await expect.poll(() => savedCopy(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  // The signed-out pages loaded afterwards may be cached again (they hold nothing private); the signed-in ones must be gone.
  const signedInCopies = () =>
    page
      .evaluate(async () => {
        let n = 0;
        for (const name of await caches.keys()) {
          if (!name.startsWith("tp-pages")) continue;
          const cache = await caches.open(name);
          for (const path of ["/itinerary", "/settings"]) if (await cache.match(path)) n++;
        }
        return n;
      })
      .catch(() => -1);
  await expect.poll(signedInCopies, { timeout: 15_000 }).toBe(0);
});

test("a saved-copy database that was created empty is repaired, so saving still works", async ({ page }) => {
  // Something opened the database before the app did, which leaves it at version 1 with no store.
  await page.addInitScript(() => {
    const r = indexedDB.open("trip-planner-offline");
    r.onsuccess = () => r.result.close();
  });
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/itinerary");
  await expect(page.getByText("0 of 140 done").first()).toBeVisible();
  await expect.poll(() => savedCopy(page), { timeout: 20_000 }).toBe(true);
});
