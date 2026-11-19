import { expect, test } from "@playwright/test";
import { createFakeSupabase } from "./fake-supabase";

test("pages carry the security headers, with the full CSP in report-only mode", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  const report = h["content-security-policy-report-only"];
  expect(report).toContain("default-src 'self'");
  expect(report).toContain("fake.supabase.test"); // the Supabase address comes from the environment
});

test("API POSTs from another site are refused", async ({ page }) => {
  await createFakeSupabase({ withSeed: true }).install(page);
  await page.goto("/");
  const res = await page.request.post("/api/photos/link", {
    data: { url: "https://example.com/a.jpg" },
    headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
});

test("no screen of our own breaks the full (report-only) CSP", async ({ page }) => {
  // The report-only policy logs violations to the console. Zod's eval probe was one: this keeps ours at zero.
  // (Google Maps is not loaded in e2e, so its own scripts are checked by hand after a deploy.)
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) violations.push(m.text().slice(0, 160));
  });
  await createFakeSupabase({ withSeed: true }).install(page);
  for (const path of ["/", "/itinerary", "/places", "/spend", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});
