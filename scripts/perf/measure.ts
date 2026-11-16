/**
 * Navigation timing harness (not part of the app). Runs the PRODUCTION build against the in-memory
 * fake Supabase served over real HTTP with a fixed latency per request, then clicks through the tabs
 * and reports, per navigation: time to content, requests to the Next server, requests to Supabase
 * (split browser vs server-side), and the server-side Supabase call sequence.
 *
 *   npx tsx scripts/perf/measure.ts [latencyMs=120]   (needs a build; see PERF_DIST below)
 *
 * The fake cannot verify JWTs locally, so each server-side getClaims() is a network call here.
 * Against a real project with asymmetric signing keys it is a cached local check, so treat the
 * auth-related numbers as an upper bound.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { chromium, type Request } from "@playwright/test";
import { createFakeSupabase } from "../../e2e/fake-supabase";

const LATENCY = Number(process.argv[2] ?? 120);
const FAKE_PORT = 54399;
const APP_PORT = 3220;
const APP = `http://localhost:${APP_PORT}`;
const DIST = ".next-perf";

const fake = createFakeSupabase({ withSeed: true });
type Hit = { t: number; path: string; server: boolean };
let hits: Hit[] = [];

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  let raw = "";
  req.on("data", (c: Buffer) => (raw += c.toString()));
  req.on("end", () => {
    const u = new URL(req.url ?? "/", "http://x");
    const server = !req.headers.origin; // browser calls carry an Origin; server fetches do not
    hits.push({
      t: Date.now(),
      path: u.pathname.replace("/rest/v1/", "") + (u.pathname.includes("rpc") ? "" : ""),
      server,
    });
    setTimeout(() => {
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {}
      const out = fake.respond({ method: req.method ?? "GET", url: `http://localhost:${FAKE_PORT}${req.url}`, body });
      res.writeHead(out.status, { "Content-Type": "application/json" });
      res.end(out.body === undefined ? "" : JSON.stringify(out.body));
    }, LATENCY);
  });
}).listen(FAKE_PORT);

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${FAKE_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "perf-anon",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DIST_DIR: DIST,
};

let dbg: () => Promise<string> = async () => "";
async function main() {
  if (
    await fetch(`${APP}/manifest.webmanifest`).then(
      () => true,
      () => false,
    )
  )
    throw new Error(`port ${APP_PORT} is already in use`);
  const server: ChildProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)],
    { env, stdio: "ignore" },
  );
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${APP}/manifest.webmanifest`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    const session = fake.respond({ method: "POST", url: `http://localhost:${FAKE_PORT}/auth/v1/token`, body: {} }).body;
    const cookie = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "sb-localhost-auth-token", value: cookie, url: APP }]);
    const page = await ctx.newPage();
    dbg = async () => `${page.url()} :: ${(await page.locator("body").innerText()).slice(0, 400)}`;
    await page.route("**/*", (r) => (r.request().url().startsWith("https://") ? r.abort() : r.continue())); // no fonts/tiles
    page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
    page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 300)));
    let appReqs: string[] = [];
    page.on("request", (r: Request) => {
      const u = new URL(r.url());
      if (u.origin === APP && !u.pathname.startsWith("/_next/static"))
        appReqs.push(`${r.method()} ${u.pathname}${u.search}`);
    });

    const rows: string[] = [];
    async function step(label: string, act: () => Promise<void>, ready: () => Promise<unknown>) {
      hits = [];
      appReqs = [];
      const t0 = Date.now();
      await act();
      if (process.env.DBG) {
        await page.waitForTimeout(800);
        console.log(
          "after act:",
          page.url(),
          await page.locator("[role=radio][aria-checked=true], [aria-selected=true]").allInnerTexts(),
        );
      }
      await ready();
      await page.waitForFunction('!document.querySelector(".animate-pulse")'); // real content, not a skeleton
      const ttc = Date.now() - t0;
      await new Promise((r) => setTimeout(r, 600)); // let trailing requests land
      const srv = hits.filter((h) => h.server);
      const brw = hits.filter((h) => !h.server);
      rows.push(
        `${label.padEnd(34)} ttc=${String(ttc).padStart(5)}ms  next-reqs=${appReqs.length}  sb-browser=${brw.length}  sb-server=${srv.length}`,
      );
      if (srv.length) rows.push(`   server seq: ${srv.map((h) => `${h.path}@+${h.t - hits[0]!.t}`).join(" → ")}`);
      if (appReqs.length) rows.push(`   next: ${appReqs.join(" | ")}`);
    }

    const nav = (name: string) =>
      page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name, exact: true });
    await step(
      "cold load /itinerary",
      () => page.goto(`${APP}/itinerary`).then(() => {}),
      () => page.getByRole("heading", { name: "Itinerary" }).waitFor(),
    );
    await page.getByText("Day 1").first().waitFor();
    await page.waitForLoadState("networkidle");
    await step(
      "Tab: Itinerary -> Flights",
      () => nav("Flights").click(),
      () => page.getByRole("heading", { name: "Flights" }).waitFor(),
    );
    await step(
      "Tab: Flights -> Stays",
      () => nav("Stays").click(),
      () => page.getByRole("heading", { name: "Stays" }).waitFor(),
    );
    await step(
      "Tab: Stays -> Places (cold)",
      () => nav("Places").click(),
      () => page.getByRole("heading", { name: "Places" }).waitFor(),
    );
    await step(
      "Places: All -> Food",
      () => page.getByRole("button", { name: /^Food/ }).click(),
      () => page.waitForFunction("location.search.includes(" + JSON.stringify("cat=food") + ")"),
    );
    await step(
      "Tab: Places -> Itinerary (warm)",
      () => nav("Itinerary").click(),
      () => page.getByRole("heading", { name: "Itinerary" }).waitFor(),
    );
    await step(
      "Tab: Itinerary -> Places (warm)",
      () => nav("Places").click(),
      () => page.getByRole("heading", { name: "Places" }).waitFor(),
    );
    await step(
      "Hard reload /spend",
      () => page.goto(`${APP}/spend`).then(() => {}),
      () => page.getByRole("heading", { name: "Spend" }).waitFor(),
    );
    console.log(`\nlatency per Supabase request: ${LATENCY}ms\n` + rows.join("\n"));
    await browser.close();
  } catch (e) {
    console.error("PAGE:", await dbg().catch(() => "?"));
    console.error(
      "FAILED:",
      String(e).slice(0, 800),
      "SB hits:",
      hits.map((h) => (h.server ? "S:" : "B:") + h.path).join(", "),
    );
  } finally {
    server.kill();
    process.exit(0);
  }
}
main().catch((e) => {
  console.error("FAILED:", String(e).slice(0, 600));
  process.exit(1);
});
