/**
 * Phase 3 spike (run by the owner, once): how good and how expensive are Google Places (New) results for the
 * cities in the plan? Nothing here touches the app or the database.
 *
 *   GOOGLE_MAPS_SERVER_KEY=... npx tsx scripts/places-spike.ts            # IDs-only searches + a small details sample
 *   npx tsx scripts/places-spike.ts --photos                              # also ONE photo call (Enterprise SKU)
 *   npx tsx scripts/places-spike.ts --dry                                 # print the plan and the call budget, call nothing
 *
 * The key comes from the environment or .env.local (loaded by scripts/env.ts). It is sent only in the
 * X-Goog-Api-Key header and is never printed. Google's error bodies are never printed, only the status code.
 *
 * Hard caps (all far below the free monthly allowances: 5,000 Pro, 1,000 Enterprise and Photos):
 *   Text Search IDs Only: 18 calls (unlimited free SKU)   Place Details IDs Only: 0
 *   Place Details Essentials: <= 12   Pro: <= 36   Enterprise: <= 12   Photos: <= 1 (only with --photos)
 */
import { writeFileSync } from "node:fs";
import { loadEnv } from "./env";

const dry = process.argv.includes("--dry");
const wantPhoto = process.argv.includes("--photos");
loadEnv();
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? "";
if (!dry && !KEY) {
  console.error("GOOGLE_MAPS_SERVER_KEY is not set (put it in .env.local or the environment). Use --dry to preview.");
  process.exit(1);
}

/** City centres (rough, public knowledge) used only as a location bias for the text search. */
const CITIES = [
  { slug: "vn-hanoi", name: "Hanoi", lat: 21.0285, lng: 105.8542, radius: 12000 },
  { slug: "vn-sapa", name: "Sapa", lat: 22.3364, lng: 103.8438, radius: 10000 },
  { slug: "vn-ninh-binh", name: "Ninh Binh", lat: 20.2506, lng: 105.9745, radius: 15000 },
  { slug: "jp-fukuoka", name: "Fukuoka", lat: 33.5902, lng: 130.4017, radius: 12000 },
  { slug: "jp-tokyo", name: "Tokyo", lat: 35.6762, lng: 139.6503, radius: 20000 },
  { slug: "ph-cebu", name: "Cebu", lat: 10.3157, lng: 123.8854, radius: 15000 },
];
const CATEGORIES = [
  { id: "sight", query: (c: string) => `top tourist attractions in ${c}`, type: "tourist_attraction" },
  { id: "food", query: (c: string) => `best local restaurants in ${c}`, type: "restaurant" },
  { id: "hotel", query: (c: string) => `hotels in ${c}`, type: "lodging" },
] as const;

/** Billing tier of each field (from the official Place Details data-fields page, checked 2026-11-07). */
const TIER: Record<string, "IDs Only" | "Essentials" | "Pro" | "Enterprise" | "Enterprise+Atmosphere"> = {
  id: "IDs Only",
  name: "IDs Only",
  photos: "IDs Only",
  formattedAddress: "Essentials",
  location: "Essentials",
  types: "Essentials",
  displayName: "Pro",
  googleMapsUri: "Pro",
  primaryType: "Pro",
  rating: "Enterprise",
  userRatingCount: "Enterprise",
  priceLevel: "Enterprise",
  regularOpeningHours: "Enterprise",
  editorialSummary: "Enterprise+Atmosphere",
  reviews: "Enterprise+Atmosphere",
};
const ORDER = ["IDs Only", "Essentials", "Pro", "Enterprise", "Enterprise+Atmosphere"] as const;
/** A request is billed at the highest tier of any field in its mask. */
const tierOf = (mask: string) => {
  let top = 0;
  for (const f of mask.split(",").map((x) => x.trim().replace(/^places\./, ""))) {
    const t = TIER[f];
    if (!t) throw new Error(`Unknown field "${f}": add it to TIER from the official data-fields page, never guess`);
    top = Math.max(top, ORDER.indexOf(t));
  }
  return ORDER[top];
};

const MASKS = {
  essentials: "location,types",
  pro: "displayName,location,googleMapsUri",
  enterprise: "displayName,location,googleMapsUri,rating,userRatingCount",
} as const;
const CAP = { Essentials: 12, Pro: 36, Enterprise: 12, Photos: 1 };
const used = { search: 0, Essentials: 0, Pro: 0, Enterprise: 0, Photos: 0 };

async function call(url: string, init: RequestInit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) {
      // Only a fixed-format reason code (e.g. SERVICE_DISABLED) is surfaced, never the body, headers or URL.
      let reason = "";
      try {
        const b = (await res.json()) as {
          error?: { status?: string; message?: string; details?: { reason?: string }[] };
        };
        const raw = b.error?.details?.find((d) => d.reason)?.reason ?? b.error?.status ?? "";
        const code = /^[A-Z][A-Z0-9_]{2,60}$/.test(raw) ? raw : "";
        // Local debugging aid only: the message with key-like strings and long numbers removed, capped in length.
        const msg = (b.error?.message ?? "")
          .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]")
          .replace(/\d{6,}/g, "[n]")
          .replace(/https?:\/\/\S+/g, "[url]")
          .slice(0, 200);
        reason = msg ? `${code}: ${msg}` : code;
      } catch {}
      return { ok: false as const, status: res.status, reason };
    }
    return { ok: true as const, json: (await res.json()) as unknown, status: res.status };
  } catch {
    return { ok: false as const, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
const headers = (mask: string) => ({
  "Content-Type": "application/json",
  "X-Goog-Api-Key": KEY,
  "X-Goog-FieldMask": mask,
});

type SearchResult = { places?: { id: string }[] };
type Detail = {
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
  photos?: { name: string; authorAttributions?: { displayName: string }[] }[];
};

async function main() {
  console.log(
    `Plan: ${CITIES.length} cities x ${CATEGORIES.length} categories = ${CITIES.length * CATEGORIES.length} Text Search (IDs Only) calls`,
  );
  console.log(
    `Mask tiers: IDs-only search "places.id" -> ${tierOf("id")}; essentials "${MASKS.essentials}" -> ${tierOf(MASKS.essentials)}; pro "${MASKS.pro}" -> ${tierOf(MASKS.pro)}; enterprise "${MASKS.enterprise}" -> ${tierOf(MASKS.enterprise)}`,
  );
  console.log(`Caps: ${JSON.stringify(CAP)}${wantPhoto ? "" : " (photo call off; pass --photos)"}`);
  if (dry) return;

  const report: Record<string, unknown>[] = [];
  const sample: { city: string; category: string; id: string }[] = [];

  for (const city of CITIES) {
    for (const cat of CATEGORIES) {
      used.search++;
      const r = await call("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: headers("places.id"),
        body: JSON.stringify({
          textQuery: cat.query(city.name),
          includedType: cat.type,
          pageSize: 20,
          locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: city.radius } },
        }),
      });
      const ids = r.ok ? ((r.json as SearchResult).places ?? []).map((p) => p.id) : [];
      console.log(
        `${city.name.padEnd(10)} ${cat.id.padEnd(6)} -> ${r.ok ? `${ids.length} place IDs` : `FAILED (status ${r.status}${"reason" in r && r.reason ? `, ${r.reason}` : ""})`}`,
      );
      report.push({ city: city.slug, category: cat.id, count: ids.length, status: r.status });
      for (const id of ids.slice(0, 2)) sample.push({ city: city.slug, category: cat.id, id });
      await new Promise((res) => setTimeout(res, 250));
    }
  }

  // Details sample: for each sampled place ask Pro (name, coordinates, link). A few also get Essentials / Enterprise
  // so the card fields can be decided from real numbers.
  const details: { key: string; d: Detail }[] = [];
  const get = async (id: string, mask: string, bucket: "Essentials" | "Pro" | "Enterprise") => {
    if (used[bucket] >= CAP[bucket]) return null;
    used[bucket]++;
    const r = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: headers(mask),
    });
    return r.ok ? (r.json as Detail) : null;
  };
  for (const [i, s] of sample.entries()) {
    const d = await get(s.id, MASKS.pro, "Pro");
    if (d) details.push({ key: `${s.city}/${s.category}`, d });
    if (i < CAP.Essentials) await get(s.id, MASKS.essentials, "Essentials");
    if (i % 3 === 0) {
      const e = await get(s.id, MASKS.enterprise, "Enterprise");
      if (e) details.push({ key: `${s.city}/${s.category}#ent`, d: e });
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  const withRating = details.filter((x) => x.key.endsWith("#ent") && x.d.rating !== undefined).length;
  const entTotal = details.filter((x) => x.key.endsWith("#ent")).length;
  const proTotal = details.filter((x) => !x.key.endsWith("#ent")).length;
  const proComplete = details.filter(
    (x) => !x.key.endsWith("#ent") && x.d.displayName && x.d.location && x.d.googleMapsUri,
  ).length;
  console.log(
    `\nDetails sample: Pro ${proComplete}/${proTotal} had name+coordinates+link; Enterprise ${withRating}/${entTotal} had a rating`,
  );

  if (wantPhoto) {
    const withPhoto = sample.length
      ? await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(sample[0].id)}`, {
          headers: headers("photos"),
        })
      : null;
    const photo = withPhoto?.ok ? (withPhoto.json as Detail).photos?.[0] : undefined;
    if (photo && used.Photos < CAP.Photos) {
      used.Photos++;
      // skipHttpRedirect=true returns JSON with a short-lived keyless photoUri. We print only whether it worked.
      const r = await call(
        `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=480&skipHttpRedirect=true`,
        { headers: { "X-Goog-Api-Key": KEY } },
      );
      const uri = r.ok ? ((r.json as { photoUri?: string }).photoUri ?? "") : "";
      console.log(
        `Photo call: ${r.ok ? "ok" : `FAILED (status ${r.status})`}; keyless photoUri returned: ${uri.startsWith("https://") && !uri.includes("key=")}; author attribution present: ${!!photo.authorAttributions?.length}`,
      );
    } else console.log("Photo call skipped (no photo reference in the sample).");
  }

  const byCity = new Map<string, string[]>();
  for (const r of report)
    byCity.set(String(r.city), [...(byCity.get(String(r.city)) ?? []), `${r.category}:${r.count}`]);
  console.log("\nIDs per city:", [...byCity.entries()].map(([c, v]) => `${c} [${v.join(" ")}]`).join(" | "));
  console.log(
    `\nCalls made: text search (IDs only) ${used.search}, details Essentials ${used.Essentials}, Pro ${used.Pro}, Enterprise ${used.Enterprise}, photos ${used.Photos}`,
  );
  console.log(
    `Of the free monthly allowances that is: Pro ${((used.Pro / 5000) * 100).toFixed(1)}%, Enterprise ${((used.Enterprise / 1000) * 100).toFixed(1)}%, Photos ${((used.Photos / 1000) * 100).toFixed(1)}%`,
  );

  // Names are Google content: show a few to judge quality now, but write only counts to the file (never names/ratings).
  const outFile = "places-spike-result.json";
  writeFileSync(
    outFile,
    JSON.stringify({ at: new Date().toISOString().slice(0, 10), searches: report, calls: used }, null, 2),
  );
  console.log(
    `\nWrote counts only (no Google content) to ${outFile}. Paste this output back to me; it contains no key.`,
  );
  console.log("Quality check, 6 sample names (not saved anywhere):");
  for (const x of details.filter((y) => !y.key.endsWith("#ent")).slice(0, 6))
    console.log(`  ${x.key}: ${x.d.displayName?.text ?? "?"}`);
}

main().catch(() => {
  console.error(
    "Spike failed (details withheld so no request data reaches the log). Check the key and network, then retry.",
  );
  process.exit(1);
});
