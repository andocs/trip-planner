/**
 * npm run check:real-build   (opt-in; needs Docker: `npx supabase start`, and about 3 minutes)
 *
 * Runs a REAL production build against the LOCAL database with REAL sessions, in a real browser. The ordinary browser tests
 * use a fake backend, which skips the server-side prefetch the access gate depends on, so a hydration mismatch there is
 * invisible to them. This catches it. Scenarios, each loaded as fresh server HTML:
 *   owner     sees the plan; reloading offline (service worker + saved copy) still shows it, with the banner
 *   viewer    (joined by the invite link) sees the plan and the "View only" banner
 *   stranger  (signed in as a guest, never joined) sees "No access yet"
 *   signed out sees "Invite only"
 * and fails on any React hydration error, uncaught error or Content-Security-Policy violation on any of them.
 *
 *   SKIP_BUILD=1 npm run check:real-build   reuses the last build (.next-real).
 * Creates throwaway users and one throwaway trip locally and deletes them. Never touches a remote project.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const out = execSync("npx supabase status -o env", { encoding: "utf8" });
const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?$`, "m").exec(out)?.[1] ?? "";
const url = get("API_URL");
const anon = get("ANON_KEY");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("This check only runs against the local Supabase stack.");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, get("SERVICE_ROLE_KEY"), opts) as SupabaseClient;
const PORT = 3220;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sessionCookies(session: unknown) {
  const name = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const parts = value.match(/.{1,3000}/g) ?? [value];
  return (parts.length === 1 ? [{ name, value }] : parts.map((v, i) => ({ name: `${name}.${i}`, value: v }))).map((c) => ({ ...c, url: BASE }));
}

const problems: string[] = [];
function watch(page: Page, label: () => string) {
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|Minified React error|Content Security Policy|Refused to/i.test(t)) problems.push(`[${label()}] ${t.slice(0, 180)}`);
  });
  page.on("pageerror", (e) => problems.push(`[${label()}] pageerror: ${e.message.slice(0, 160)}`));
}
const see = (page: Page, text: string | RegExp, ms = 25_000) => page.getByText(text).first().waitFor({ timeout: ms });

async function main() {
  const stamp = Date.now();
  const password = randomBytes(24).toString("base64url");
  const created: string[] = [];
  const newUser = async (email: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    created.push(data.user.id);
    return data.user.id;
  };

  const ownerEmail = `real-owner-${stamp}@check.test`;
  const ownerId = await newUser(ownerEmail);
  const identity = JSON.stringify({ sub: ownerId, email: ownerEmail, email_verified: true });
  execSync("docker exec -i supabase_db_trip-planner psql -U postgres -v ON_ERROR_STOP=1", {
    input: `insert into auth.identities (id,user_id,identity_data,provider,provider_id,created_at,updated_at) values (gen_random_uuid(),'${ownerId}','${identity}'::jsonb,'google','${ownerId}',now(),now());`,
  });
  await admin.from("app_admins").insert({ email: ownerEmail });
  const owner = createClient(url, anon, opts) as SupabaseClient;
  const { data: ownerSession, error: oe } = await owner.auth.signInWithPassword({ email: ownerEmail, password });
  if (oe || !ownerSession.session) throw oe;

  let tripId: string | undefined;
  let server: ChildProcess | undefined;
  try {
    tripId = (await owner.rpc("create_trip", { p_name: "Real build check" })).data as string;
    // Dates relative to today: day 1 is inside the forecast reach, day 40 is far beyond it ("usually", from last year).
    const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await admin.from("trips").update({ status: "active", start_date: iso(2), end_date: iso(6) }).eq("id", tripId);
    const must = (r: { error: { message: string } | null }, what: string) => {
      if (r.error) throw new Error(`${what}: ${r.error.message}`);
    };
    must(await owner.from("itinerary_items").insert([
      { id: randomUUID(), trip_id: tripId, activity: "Real stop one", day: 1, kind: "stop", position: 1000, city: "London" },
      { id: randomUUID(), trip_id: tripId, activity: "Real stop two", day: 1, kind: "stop", position: 2000, city: "London" },
      { id: randomUUID(), trip_id: tripId, activity: "Far stop", day: 40, kind: "stop", position: 1000, city: "London" },
    ]), "itinerary");
    // Neutral coordinates (London): this check really calls the weather service, so it must not send anyone's real trip.
    must(await owner.from("destinations").insert({ id: randomUUID(), trip_id: tripId, city: "London", country: "UK", nights: 5, lat: 51.51, lng: -0.13, sort: 0 }), "destination");
    must(await owner.from("hotel_ideas").insert({ id: randomUUID(), trip_id: tripId, hotel: "Real Inn", decision: "confirmed", is_stay: true, check_in: "2026-06-16", check_out: "2026-06-18", stay_status: "Booked" }), "stay");

    // a viewer who joined by the invite link, and a stranger who signed in as a guest but never joined
    const joinToken = ((await owner.rpc("active_trip")).data as { join_token: string }[])[0].join_token;
    const viewer = createClient(url, anon, opts) as SupabaseClient;
    const vs = await viewer.auth.signInAnonymously();
    if (vs.error || !vs.data.session) throw vs.error;
    created.push(vs.data.user!.id);
    must(await viewer.rpc("join_trip", { p_token: joinToken }), "join");
    const stranger = createClient(url, anon, opts) as SupabaseClient;
    const ss = await stranger.auth.signInAnonymously();
    if (ss.error || !ss.data.session) throw ss.error;
    created.push(ss.data.user!.id);

    console.log("building a production build against the local database…");
    const env = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      NEXT_DIST_DIR: ".next-real",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "",
      NEXT_PUBLIC_GOOGLE_MAP_ID: "",
      GOOGLE_MAPS_SERVER_KEY: "",
    };
    if (!process.env.SKIP_BUILD) execSync("npx next build", { env, stdio: "ignore", timeout: 400_000 });
    server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "ignore", shell: true });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/manifest.webmanifest`)).ok) break;
      } catch {}
      await sleep(1000);
    }

    const browser = await chromium.launch();
    let phase = "start";
    const open = async (session: unknown, serviceWorkers: "allow" | "block" = "block") => {
      const context: BrowserContext = await browser.newContext({ serviceWorkers });
      if (session) await context.addCookies(sessionCookies(session));
      const page = await context.newPage();
      watch(page, () => phase);
      return { context, page };
    };

    /** Opens an address and waits for the page to settle; a failure names the address. */
    const visit = async (page: Page, path: string) => {
      const seen: string[] = [];
      const onRequest = (r: { url: () => string }) => seen.push(r.url().replace(BASE, "").slice(0, 90));
      page.on("request", onRequest);
      try {
        await page.goto(BASE + path);
        await page.waitForLoadState("networkidle");
        await sleep(400);
      } catch (e) {
        throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)} | ${seen.length} requests, last: ${seen.slice(-6).join(" ; ")}`);
      } finally {
        page.off("request", onRequest);
      }
    };

    // owner: every main screen is fresh server HTML (the prefetch differs per screen)
    phase = "owner";
    {
      const { context, page } = await open(ownerSession.session, "allow");
      for (const path of ["/", "/itinerary", "/stays", "/places", "/flights", "/spend", "/pack", "/settings"]) {
        phase = `owner ${path}`;
        await visit(page, path);
      }
      // the same screens at their own trip addresses (the server prefetch reads the trip id from the path)
      for (const path of [`/t/${tripId}`, `/t/${tripId}/itinerary`, `/t/${tripId}/places`, `/t/${tripId}/settings`]) {
        phase = `owner ${path}`;
        await visit(page, path);
      }
      phase = "owner a trip id that is not theirs";
      await page.goto(`${BASE}/t/00000000-0000-4000-8000-0000000000aa/itinerary`);
      await see(page, "That trip isn’t available");
      phase = "owner /itinerary";
      await page.goto(`${BASE}/itinerary`);
      await see(page, "Real stop one");
      console.log("owner: plan visible on every screen");
      phase = "owner weather";
      await page.goto(BASE + "/itinerary");
      await page.getByRole("img", { name: /^Weather: (?!Usually)/ }).first().waitFor({ timeout: 40_000 });
      await page.getByRole("img", { name: /^Weather: Usually/ }).first().waitFor({ timeout: 40_000 });
      console.log("owner: a real forecast and a real 'usually' day from the weather service");

      // offline reload: service worker + the saved copy
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      phase = "owner reload through the worker";
      await page.reload();
      await see(page, "Real stop one");
      const saved = () =>
        page.evaluate(
          () =>
            indexedDB.databases().then(
              (dbs) =>
                new Promise<boolean>((resolve) => {
                  if (!dbs.some((d) => d.name === "trip-planner-offline")) return resolve(false);
                  const o = indexedDB.open("trip-planner-offline");
                  o.onsuccess = () => {
                    const db = o.result;
                    try {
                      const g = db.transaction("kv").objectStore("kv").get("query-cache");
                      g.onsuccess = () => {
                        db.close();
                        resolve(!!g.result);
                      };
                      g.onerror = () => {
                        db.close();
                        resolve(false);
                      };
                    } catch {
                      db.close();
                      resolve(false);
                    }
                  };
                  o.onerror = () => resolve(false);
                }),
            ),
        );
      for (let i = 0; i < 40 && !(await saved()); i++) await sleep(500);
      if (!(await saved())) throw new Error("the saved copy was never written");
      phase = "owner OFFLINE reload";
      await context.setOffline(true);
      await page.reload();
      await see(page, "Real stop one");
      await see(page, /You.re offline/, 10_000);
      await sleep(2500);
      console.log("owner: offline reload shows the saved plan and the banner");
      phase = "owner back online";
      await context.setOffline(false);
      await page.getByText(/You.re offline/).first().waitFor({ state: "detached", timeout: 10_000 });
      await context.close();
    }

    phase = "viewer";
    {
      const { context, page } = await open(vs.data.session);
      // every main screen as a viewer too: read-only branches render different trees than the owner's
      for (const path of ["/", "/stays", "/places", "/flights", "/spend", "/pack", "/settings", `/t/${tripId}`, `/t/${tripId}/spend`]) {
        phase = `viewer ${path}`;
        await visit(page, path);
      }
      phase = "viewer";
      await page.goto(`${BASE}/itinerary`);
      await see(page, "Real stop one");
      await see(page, "View only");
      await page.getByRole("img", { name: /^Weather:/ }).first().waitFor({ timeout: 40_000 });
      await sleep(1500);
      console.log("viewer: every main screen loads, and the itinerary shows the View only banner");
      await context.close();
    }

    phase = "stranger";
    {
      const { context, page } = await open(ss.data.session);
      await page.goto(`${BASE}/itinerary`);
      await see(page, "No access yet");
      const refused = await page.request.get(`${BASE}/api/weather?trip=${tripId}&lat=51.51&lng=-0.13&from=${iso(2)}&to=${iso(3)}`);
      if (refused.status() !== 401) throw new Error(`a guest who never joined got ${refused.status()} from /api/weather, expected 401`);
      await sleep(1500);
      console.log("stranger: sees No access yet");
      await context.close();
    }

    phase = "signed out";
    {
      const { context, page } = await open(null);
      await page.goto(`${BASE}/itinerary`);
      await see(page, "Invite only");
      const refused = await page.request.get(`${BASE}/api/weather?trip=${tripId}&lat=51.51&lng=-0.13&from=${iso(2)}&to=${iso(3)}`);
      if (refused.status() !== 401) throw new Error(`a signed-out visitor got ${refused.status()} from /api/weather, expected 401`);
      await sleep(1500);
      console.log("signed out: sees Invite only");
      await context.close();
    }

    await browser.close();
    if (problems.length) throw new Error("console problems:\n" + [...new Set(problems)].join("\n"));
    console.log("REAL BUILD CHECK PASSED (no hydration, script or CSP problems)");
  } finally {
    // The server is started through a shell: kill the whole tree or `next start` keeps the port.
    try {
      if (server?.pid) execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" });
    } catch {}
    if (tripId) await admin.from("trips").delete().eq("id", tripId);
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await admin.from("app_admins").delete().eq("email", ownerEmail);
  }
}
main().catch((e) => {
  console.error("REAL BUILD CHECK FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
