import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal .env.local loader for scripts (Next.js loads it for the app itself). */
export function loadEnv(file = ".env.local") {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
