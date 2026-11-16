/**
 * npm run check:secrets  [--require-build]
 *
 * Fails (exit 1) if a Google API key may be exposed:
 *   1. a NEXT_PUBLIC_* variable whose name looks like a secret, or whose value looks like a Google key
 *      (the single allowed exception is NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY, a referrer-restricted browser key);
 *   2. an "AIza…" key, or the server key's value, in the built client bundles (.next/static) or public/;
 *   3. an "AIza…" key in the working tree (tracked files and untracked files that are not git-ignored);
 *   4. an "AIza…" key anywhere in `git log -p --all`;
 *   5. .env.local (or any .env* except .env.example) ever committed, or .gitignore not covering .env*.
 *
 * It never reads ignored files (so never .env.local) and never prints a key, only a masked excerpt.
 * Run `npm run build` first to include the bundle scan. The browser key's value is read from the environment of
 * THIS shell only to recognise it in the bundle; set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY when you run the check.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { BROWSER_KEY_NAME, ROTATE_ADVICE, checkPublicEnv, scanText, type Finding } from "./secrets-lib";

const root = process.cwd();
const requireBuild = process.argv.includes("--require-build");
const browserKey = process.env[BROWSER_KEY_NAME];
const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
const allow = new Set(browserKey ? [browserKey] : []);
const findings: Finding[] = [];
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const TEXT = /\.(m?js|cjs|css|html?|json|map|txt|ts|tsx|md|mdx|sql|yml|yaml|toml|svg|webmanifest|env\.example)$/i;
function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// 1. environment of this shell
findings.push(...checkPublicEnv(process.env));

// 2. built client bundles
const builds = [".next/static", ".next-e2e/static", "public"].map((d) => join(root, d)).filter((d) => existsSync(d));
if (builds.length === 0) {
  const msg = "No build output found (.next/static). Run `npm run build` to include the bundle scan.";
  if (requireBuild) findings.push({ where: "build", what: msg });
  else console.log(`note: ${msg}`);
}
for (const dir of builds)
  for (const file of walk(dir)) {
    if (!TEXT.test(file) || statSync(file).size > 8 * 1024 * 1024) continue;
    findings.push(...scanText(readFileSync(file, "utf8"), relative(root, file), { allow, serverKey }));
  }

// 3. working tree: tracked files plus untracked files that git does not ignore (so never .env.local)
const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
for (const f of files) {
  const abs = join(root, f);
  if (!existsSync(abs) || !TEXT.test(f) || /(^|\/)package-lock\.json$/.test(f)) continue;
  if (statSync(abs).size > 4 * 1024 * 1024) continue;
  findings.push(...scanText(readFileSync(abs, "utf8"), f, { allow: new Set(), serverKey }));
}

// 5. .env files in history, and .gitignore coverage
const envEver = git(["log", "--all", "--diff-filter=A", "--name-only", "--format=", "--", ".env*", "**/.env*"])
  .split("\n")
  .filter((l) => l && !/\.env\.example$/.test(l));
for (const f of new Set(envEver))
  findings.push({ where: `git history: ${f}`, what: "an .env file was committed at some point" });
try {
  execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: root });
} catch {
  findings.push({ where: ".gitignore", what: ".env.local is not ignored" });
}

// 4. git history (streamed: it can be large)
async function history() {
  const p = spawn("git", ["log", "-p", "--all", "--no-color", "--format=commit %h"], { cwd: root });
  let commit = "?";
  let n = 0;
  const rl = createInterface({ input: p.stdout });
  for await (const line of rl) {
    n++;
    if (line.startsWith("commit ")) commit = line.slice(7);
    if (!line.includes("AIza") && !(serverKey && serverKey.length >= 20 && line.includes(serverKey))) continue;
    findings.push(
      ...scanText(line, `git history ${commit}`, { allow: new Set(), serverKey }).map((f) => ({
        ...f,
        where: `git history, commit ${commit}`,
      })),
    );
  }
  return n;
}

async function main() {
  const lines = await history();
  const unique = [...new Map(findings.map((f) => [`${f.where}|${f.what}`, f])).values()];
  console.log(
    `Scanned: env, ${builds.length} build folder(s), ${files.length} working-tree files, ${lines} lines of git history.`,
  );
  if (unique.length) {
    console.error(`\n${unique.length} problem(s):`);
    for (const f of unique.slice(0, 40)) console.error(`  - ${f.where}: ${f.what}`);
    console.error(`\n${ROTATE_ADVICE}`);
    process.exit(1);
  }
  console.log("OK: no Google key found in the environment, bundles, working tree or git history.");
}

void main();
