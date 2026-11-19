/*
 * Trip Planner service worker: makes the app OPEN without signal, read-only (issue #20).
 *
 * What it does, and nothing more:
 *  1. Built JS, CSS and fonts (/_next/static/*, named by a hash of their content) are kept the first time they are fetched
 *     and served from the copy afterwards. A changed file has a new name, so a stale one can never be served.
 *  2. The main screens' pages (APP_PATHS) are fetched from the network as usual and a copy is kept. ONLY when the network
 *     fails is the copy shown; online, the network always wins, so nobody sees an old page while connected.
 *  3. If there is no copy of a screen, /offline.html explains it.
 * It never touches the API, Supabase, images, or any request that is not a GET to this site. The trip's data comes from the
 * saved copy of the app's own cache (lib/offline/persist.ts), not from here.
 *
 * The copies live in caches named "tp-*" and are deleted when the person signs out (lib/offline/clear.ts).
 * Bump VERSION to drop every old cache on the next deploy.
 */
const VERSION = "v2";
const STATIC = "tp-static-" + VERSION;
const PAGES = "tp-pages-" + VERSION;
// Keep in step with APP_PATHS in components/offline/sw-register.tsx.
const APP_PATHS = ["/", "/itinerary", "/flights", "/stays", "/places", "/spend", "/pack", "/settings"];
// /t/<trip id>/... is the same set of screens inside a trip.
const TRIP_PREFIX = /^\/t\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/i;
const isAppPath = (p) => APP_PATHS.includes(p.replace(TRIP_PREFIX, "") || "/");
const MAX_STATIC_ENTRIES = 600;
const MAX_ASSETS_PER_PAGE = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request("/offline.html", { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("tp-") && name !== STATIC && name !== PAGES) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && isAppPath(url.pathname)) {
    event.respondWith(networkFirstPage(req, url.pathname));
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "warm" && Array.isArray(msg.urls)) event.waitUntil(warm(msg.urls));
  else if (msg.type === "clear") event.waitUntil(clearAll());
});

// Bumped by every clear. A warm-up that started before a clear (a sign-out) must not write its pages afterwards.
let generation = 0;

const cacheable = (res) => res.ok && !res.redirected && res.type === "basic";

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) {
    await cache.put(req, res.clone());
    await trim(cache);
  }
  return res;
}

async function networkFirstPage(req, path) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (cacheable(res)) await cache.put(path, res.clone());
    return res;
  } catch {
    return (await cache.match(path)) || (await cache.match("/offline.html")) || Response.error();
  }
}

/** Keeps a copy of each screen and of the files it needs, so a screen never opened before still works offline. */
async function warm(paths) {
  const started = generation;
  const pages = await caches.open(PAGES);
  const assets = await caches.open(STATIC);
  for (const path of paths) {
    if (!isAppPath(path)) continue;
    try {
      const res = await fetch(path, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!cacheable(res) || started !== generation) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const found = new Set(html.match(/static\/(?:chunks|css|media)\/[\w\-.~%]+(?:\/[\w\-.~%]+)*\.(?:js|css|woff2?)/g) || []);
      let n = 0;
      for (const rel of found) {
        if (n++ >= MAX_ASSETS_PER_PAGE) break;
        const assetUrl = "/_next/" + rel;
        if (await assets.match(assetUrl)) continue;
        try {
          const a = await fetch(assetUrl);
          if (cacheable(a) && started === generation) await assets.put(assetUrl, a);
        } catch {
          /* one file missing is fine: it is fetched when needed */
        }
      }
      await trim(assets);
    } catch {
      /* offline or the server is busy: the next warm-up tries again */
    }
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) await cache.delete(keys[i]);
}

async function clearAll() {
  generation++;
  for (const name of await caches.keys()) if (name.startsWith("tp-")) await caches.delete(name);
}
