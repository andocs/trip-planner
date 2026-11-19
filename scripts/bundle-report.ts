/**
 * npm run analyze:bundle   (about a minute; no database or network needed)
 *
 * Where the browser's JavaScript comes from, per screen. Runs Next's own Turbopack analyzer (`next analyze --output`, which
 * writes data instead of starting a web page) with placeholder environment values, reads its module data, and prints for each
 * screen how much compressed JavaScript the browser must download BEFORE the screen works ("up front") and how much is loaded
 * later on demand, plus the packages and app folders that make up the up-front part. Sizes are gzip, as sent over the network.
 *
 *   npm run analyze:bundle                  every screen
 *   npm run analyze:bundle -- itinerary     one screen (a folder name under .next-analyze/diagnostics/analyze/data)
 *   SKIP_ANALYZE=1 npm run analyze:bundle   read the last analysis again
 *
 * Why it exists: nothing else in the repo shows bundle size, and a heavy library imported in the wrong place makes every
 * screen slower for everyone. Run it before and after adding a dependency or a big component.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = ".next-analyze";
const DATA = join(DIST, "diagnostics", "analyze", "data");

if (!process.env.SKIP_ANALYZE) {
  console.log("analyzing the production bundle…");
  execSync("npx next analyze --output", {
    stdio: "ignore",
    timeout: 400_000,
    env: {
      ...process.env,
      NEXT_DIST_DIR: DIST,
      NEXT_TELEMETRY_DISABLED: "1",
      // placeholders: the analyzer only reads the code, it never connects to anything
      NEXT_PUBLIC_SUPABASE_URL: "http://placeholder.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder",
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "",
      NEXT_PUBLIC_GOOGLE_MAP_ID: "",
      GOOGLE_MAPS_SERVER_KEY: "",
    },
  });
}

type Part = { source_index: number; output_file_index: number; size: number; compressed_size: number };
type Group = { kind: string; output_file_indices: number[] };
type Analysis = {
  sources: { parent_source_index?: number | null; path: string }[];
  chunk_parts: Part[];
  output_files: { filename: string }[];
  chunk_groups: Group[];
};

function load(file: string): Analysis {
  const buf = readFileSync(file);
  const len = buf.readUInt32BE(0); // a 4-byte length, then that many bytes of JSON, then binary
  return JSON.parse(buf.subarray(4, 4 + len).toString("utf8")) as Analysis;
}

/** The full path of a source: its own name under its parents'. */
function pathOf(a: Analysis, index: number): string {
  const parts: string[] = [];
  let k: number | null | undefined = index;
  for (let guard = 0; k !== null && k !== undefined && guard < 60; guard++) {
    const s: Analysis["sources"][number] | undefined = a.sources[k];
    if (!s) break;
    parts.unshift(s.path);
    k = s.parent_source_index;
  }
  return parts.join("").replace(/\/+/g, "/");
}

/** "react-dom", "@tanstack/react-query", or an app folder like "app: components/plan". */
function owner(path: string): string {
  const nm = path.lastIndexOf("node_modules/");
  if (nm >= 0) {
    const rest = path.slice(nm + "node_modules/".length).split("/");
    return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  }
  const rel = path.replace(/^\/?\[project\]\//, "");
  const parts = rel.split("/");
  return `app: ${parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0]}`;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`.padStart(10);

type Totals = { upFront: number; later: number; byOwner: Map<string, number> };

function measure(file: string): Totals {
  const a = load(file);
  const clientFiles = new Set(a.output_files.map((f, i) => (f.filename.startsWith("[client-fs]") ? i : -1)).filter((i) => i >= 0));
  // Loaded up front = the bootstrap group and the chunks the route needs to render; the rest is loaded when something asks.
  const upFrontFiles = new Set<number>();
  for (const g of a.chunk_groups) if (g.kind !== "async") for (const i of g.output_file_indices) if (clientFiles.has(i)) upFrontFiles.add(i);
  const t: Totals = { upFront: 0, later: 0, byOwner: new Map() };
  for (const p of a.chunk_parts) {
    if (!clientFiles.has(p.output_file_index)) continue;
    if (upFrontFiles.has(p.output_file_index)) {
      t.upFront += p.compressed_size;
      const o = owner(pathOf(a, p.source_index));
      t.byOwner.set(o, (t.byOwner.get(o) ?? 0) + p.compressed_size);
    } else t.later += p.compressed_size;
  }
  return t;
}

const only = process.argv[2];
const routes = readdirSync(DATA, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "api" && d.name !== "middleware" && existsSync(join(DATA, d.name, "analyze.data")))
  .map((d) => d.name)
  .filter((n) => !only || n === only);
if (existsSync(join(DATA, "analyze.data")) && !only) routes.unshift("");

const results = new Map<string, Totals>();
for (const r of routes) results.set(r, measure(join(DATA, r, "analyze.data")));

console.log(`\nJavaScript the browser downloads (gzip). "Up front" is needed before the screen works; "later" loads on demand.\n`);
console.log("screen".padEnd(18) + "up front".padStart(11) + "later".padStart(11));
for (const [r, t] of [...results].sort((x, y) => y[1].upFront - x[1].upFront)) console.log(`/${r}`.padEnd(18) + kb(t.upFront) + " " + kb(t.later));

const pick = only ? only : [...results].sort((x, y) => y[1].upFront - x[1].upFront)[0][0];
const top = results.get(pick)!;
console.log(`\nWhat the "/${pick}" screen loads up front, largest first:\n`);
for (const [name, bytes] of [...top.byOwner].sort((x, y) => y[1] - x[1]).slice(0, 22)) console.log("  " + name.padEnd(40) + kb(bytes));
