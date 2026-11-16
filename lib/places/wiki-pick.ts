import type { WikiPhoto } from "./types";

/**
 * Choosing a Wikimedia Commons photo for a place. Pure functions, so the rules are unit-tested.
 * Only freely licensed files are used (CC0, public domain, CC BY, CC BY-SA); NonCommercial and NoDerivs are refused.
 * The file name must really match the place name: a photo of the wrong thing is worse than no photo.
 */

export type CommonsFile = {
  title: string; // "File:Hoan Kiem Lake.jpg"
  thumbUrl: string;
  pageUrl: string;
  width: number;
  height: number;
  mime: string;
  license: string; // LicenseShortName
  licenseUrl: string | null;
  artist: string; // may contain HTML
  dist: number; // metres from the place
};

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Words that say what kind of place it is but do not identify it. */
const GENERIC = new Set([
  "the",
  "of",
  "and",
  "de",
  "la",
  "le",
  "hotel",
  "hotels",
  "resort",
  "restaurant",
  "cafe",
  "coffee",
  "bar",
  "grill",
  "house",
  "inn",
  "hostel",
  "villa",
  "homestay",
  "shop",
  "market",
  "old",
  "new",
  "city",
  "center",
  "centre",
  "main",
]);

export const tokens = (name: string) =>
  norm(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC.has(t));

export function nameMatch(place: string, fileTitle: string): number {
  const want = tokens(place);
  if (want.length === 0) return 0;
  const hay = ` ${norm(fileTitle.replace(/^File:/i, "").replace(/\.[a-z0-9]{3,4}$/i, ""))} `;
  const hit = want.filter((t) => hay.includes(` ${t} `) || hay.includes(` ${t}`)).length;
  return hit / want.length;
}

export const isFreeLicense = (l: string) =>
  /^(CC0|Public domain|PD\b|PDM)/i.test(l.trim()) || (/^CC[ -]BY/i.test(l.trim()) && !/\b(NC|ND)\b/i.test(l));

export const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const IMAGE = /^image\/(jpeg|png|webp)$/;
const THUMB_HOST = /^https:\/\/upload\.wikimedia\.org\//;
const PAGE_HOST = /^https:\/\/commons\.wikimedia\.org\//;

/** The best matching free image, or null. A name match of at least 60% of the distinctive words is required. */
export function pickPhoto(placeName: string, files: CommonsFile[]): WikiPhoto | null {
  let best: { f: CommonsFile; score: number } | null = null;
  for (const f of files) {
    if (!IMAGE.test(f.mime) || !isFreeLicense(f.license) || !THUMB_HOST.test(f.thumbUrl) || !PAGE_HOST.test(f.pageUrl))
      continue;
    if (f.width < 500) continue;
    const ratio = f.width / Math.max(1, f.height);
    if (ratio < 0.9 || ratio > 2.4) continue;
    const m = nameMatch(placeName, f.title);
    if (m < 0.6) continue;
    const score = m * 10 + Math.min(f.width, 2400) / 1000 - Math.min(f.dist, 2000) / 1000;
    if (!best || score > best.score) best = { f, score };
  }
  if (!best) return null;
  const f = best.f;
  const author = stripHtml(f.artist).slice(0, 200);
  return {
    url: f.thumbUrl,
    pageUrl: f.pageUrl,
    title: f.title.replace(/^File:/i, ""),
    author: author || "Unknown author",
    license: f.license.slice(0, 60),
    licenseUrl: f.licenseUrl && /^https:\/\//.test(f.licenseUrl) ? f.licenseUrl.slice(0, 500) : null,
  };
}
