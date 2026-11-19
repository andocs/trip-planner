import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    environment: "node",
    env: { TZ: "America/New_York" },
    // `npm run test:coverage`. Only the pure logic in lib/ is measured: the screens are covered by the browser tests.
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/database.types.ts"],
      reporter: ["text-summary", "json-summary"],
      // A floor just under the level on 2026-11-19 (61% lines, 64% branches, 54% functions). Raise it as tests are added;
      // never lower it to make a change pass.
      thresholds: { lines: 58, statements: 58, branches: 60, functions: 50 },
    },
  },
});
