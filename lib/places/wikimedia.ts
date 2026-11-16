import "server-only";

import { cacheLife } from "next/cache";
import { pickPhoto, type CommonsFile } from "./wiki-pick";
import type { WikiPhoto } from "./types";

/**
 * Wikimedia Commons lookups (free, no key). Etiquette: a descriptive User-Agent, one request at a time with a
 * short pause, and no retry loops (a 429 simply means "no photo now"). Results are cached for weeks.
 * WIKIMEDIA_API_URL exists only so the e2e tests can point at a fake server.
 */
const API = process.env.WIKIMEDIA_API_URL || "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  `TripPlanner/0.1 (private trip planning app${process.env.GEOCODER_CONTACT ? `; ${process.env.GEOCODER_CONTACT}` : ""})`;

let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  const pause = () => new Promise((r) => setTimeout(r, 300));
  queue = run.then(pause, pause);
  return run;
}

type Json = Record<string, unknown>;
/** Throws on any failure, so a timeout or a 429 is never cached as "no photo". */
async function get(params: Record<string, string>): Promise<Json> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) url.searchParams.set(k, v);
  const res = await oneAtATime(() =>
    fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) }),
  );
  if (!res.ok) throw new Error("wikimedia unavailable");
  return (await res.json()) as Json;
}

type GeoHit = { pageid: number; dist: number };
type Page = {
  pageid: number;
  title: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
};

const IMAGEINFO = {
  prop: "imageinfo",
  iiprop: "url|mime|size|extmetadata",
  iiurlwidth: "640",
  iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
};

function toFiles(json: Json, dist: (pageid: number) => number): CommonsFile[] {
  const files: CommonsFile[] = [];
  for (const p of (json.query as { pages?: Page[] } | undefined)?.pages ?? []) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl || !ii.descriptionurl) continue;
    files.push({
      title: p.title,
      thumbUrl: ii.thumburl,
      pageUrl: ii.descriptionurl,
      width: ii.width ?? 0,
      height: ii.height ?? 0,
      mime: ii.mime ?? "",
      license: ii.extmetadata?.LicenseShortName?.value ?? "",
      licenseUrl: ii.extmetadata?.LicenseUrl?.value ?? null,
      artist: ii.extmetadata?.Artist?.value ?? "",
      dist: dist(p.pageid),
    });
  }
  return files;
}

/**
 * Cached for weeks per (name, rounded location): the same place never costs a second lookup.
 * First the files geotagged within 800 m; if none of them is named like the place, a search of Commons file names
 * by the place name. Either way pickPhoto still requires the file name to match the name.
 */
export async function findWikiPhoto(name: string, lat: number, lng: number): Promise<WikiPhoto | null> {
  "use cache";
  cacheLife("weeks");
  const geo = await get({
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lng}`,
    gsradius: "800",
    gsnamespace: "6",
    gslimit: "20",
  });
  const hits = ((geo.query as { geosearch?: GeoHit[] } | undefined)?.geosearch ?? []).slice(0, 20);
  if (hits.length > 0) {
    const info = await get({ action: "query", ...IMAGEINFO, pageids: hits.map((h) => h.pageid).join("|") });
    const near = pickPhoto(name, toFiles(info, (id) => hits.find((h) => h.pageid === id)?.dist ?? 800));
    if (near) return near;
  }
  const found = await get({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: name,
    gsrlimit: "15",
    ...IMAGEINFO,
  });
  return pickPhoto(name, toFiles(found, () => 800));
}
