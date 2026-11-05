import { defineConfig, devices } from "@playwright/test";
import { FAKE_URL } from "./e2e/fake-supabase";

const PORT = 3210;

/**
 * Smoke tests run the real app against an in-memory fake of Supabase (e2e/fake-supabase.ts),
 * so they need no project or network. Run: npm run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 400_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: FAKE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next-e2e" },
  },
});
