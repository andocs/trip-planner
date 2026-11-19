/**
 * Weather on the itinerary. Pure: no React, no network, so every rule here is unit-tested.
 *
 * Source: Open-Meteo (free, no key). A day within the next 16 days gets a real FORECAST. A day further out cannot be forecast,
 * so it shows what the SAME DATE was like last year ("usually", from Open-Meteo's historical archive): honest about what it
 * is, and the case that matters most when a trip is still being planned. Past days show nothing.
 *
 * Privacy: the server makes the calls (viewers' browsers never contact the weather service), and sends only a place rounded to
 * about a kilometre and dates: no trip name, no names, no account.
 */

export type WeatherKind = "forecast" | "typical";
export type WeatherDay = {
  date: string; // YYYY-MM-DD, the day asked for
  code: number; // WMO weather code
  high: number;
  low: number;
  /** Chance of rain in percent (forecast) or null when only last year's rainfall is known. */
  rainChance: number | null;
  /** Rain in millimetres (typical days: what fell that day last year), else null. */
  rainMm: number | null;
  kind: WeatherKind;
};

export const FORECAST_DAYS = 16; // today plus the next 15
export const MAX_SPAN_DAYS = 31;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / 86_400_000);

/** The same calendar date a year earlier (29 February falls back to 28 February). */
export function sameDayLastYear(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const leap = (n: number) => (n % 4 === 0 && n % 100 !== 0) || n % 400 === 0;
  const dd = m === 2 && day === 29 && !leap(y - 1) ? 28 : day;
  return `${String(y - 1).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** A place rounded to about 1 km: enough for weather, and less to share and better for caching. */
export const roundCoord = (n: number) => Math.round(n * 100) / 100;
export const validCoords = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export type Window = { from: string; to: string };

/**
 * Which dates of [from, to] get a forecast and which get last year's weather, given today. Past dates get neither.
 * Returns the (contiguous) forecast window and typical window, each null when empty.
 */
export function windows(from: string, to: string, today: string): { forecast: Window | null; typical: Window | null } {
  const lastForecast = addDays(today, FORECAST_DAYS - 1);
  const fFrom = from < today ? today : from;
  const fTo = to > lastForecast ? lastForecast : to;
  const tFrom = from < addDays(lastForecast, 1) ? addDays(lastForecast, 1) : from;
  return {
    forecast: fFrom <= fTo ? { from: fFrom, to: fTo } : null,
    typical: tFrom <= to ? { from: tFrom, to } : null,
  };
}

export const datesIn = (w: Window): string[] => Array.from({ length: daysBetween(w.from, w.to) + 1 }, (_, i) => addDays(w.from, i));

/* ---------- reading the weather service's answers (defensively: it is a third party) ---------- */

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const daily = (json: unknown): Record<string, unknown> => {
  const d = (json as { daily?: unknown } | null)?.daily;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
};

/** Open-Meteo forecast JSON -> days. Anything missing or malformed is skipped, never guessed. */
export function parseForecast(json: unknown): WeatherDay[] {
  const d = daily(json);
  const time = arr(d.time);
  const out: WeatherDay[] = [];
  time.forEach((date, i) => {
    const code = num(arr(d.weather_code)[i]);
    const high = num(arr(d.temperature_2m_max)[i]);
    const low = num(arr(d.temperature_2m_min)[i]);
    if (!isIsoDate(date) || code === null || high === null || low === null) return;
    out.push({ date, code, high, low, rainChance: num(arr(d.precipitation_probability_max)[i]), rainMm: null, kind: "forecast" });
  });
  return out;
}

/** Open-Meteo archive JSON (last year's dates) -> days labelled with the dates that were asked for. */
export function parseTypical(json: unknown, requested: string[]): WeatherDay[] {
  const d = daily(json);
  const byDate = new Map<string, number>();
  arr(d.time).forEach((t, i) => {
    if (typeof t === "string") byDate.set(t, i);
  });
  const out: WeatherDay[] = [];
  for (const date of requested) {
    const i = byDate.get(sameDayLastYear(date));
    if (i === undefined) continue;
    const code = num(arr(d.weather_code)[i]);
    const high = num(arr(d.temperature_2m_max)[i]);
    const low = num(arr(d.temperature_2m_min)[i]);
    if (code === null || high === null || low === null) continue;
    out.push({ date, code, high, low, rainChance: null, rainMm: num(arr(d.precipitation_sum)[i]), kind: "typical" });
  }
  return out;
}

/* ---------- what a weather code means ---------- */

export type WeatherIcon = "sun" | "cloud-sun" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO weather interpretation codes, grouped the way a traveller reads them. */
export function describeCode(code: number): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: "Clear", icon: "sun" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", icon: "cloud-sun" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? "Rain showers" : "Rain", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", icon: "snow" };
  if (code >= 95 && code <= 99) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Mixed weather", icon: "cloud" };
}

export const degrees = (n: number) => `${Math.round(n)}°`;

/** The one line a chip shows and a screen reader reads: "Rain, high 29°, low 24°, 60% chance of rain". */
export function describeDay(w: WeatherDay): string {
  const { label } = describeCode(w.code);
  const rain =
    w.kind === "forecast" && w.rainChance !== null
      ? `, ${Math.round(w.rainChance)}% chance of rain`
      : w.kind === "typical" && w.rainMm !== null && w.rainMm >= 1
        ? `, it rained ${w.rainMm < 10 ? w.rainMm.toFixed(1) : Math.round(w.rainMm)} mm on this date last year`
        : "";
  return `${w.kind === "typical" ? "Usually " : ""}${label.toLowerCase()}, high ${degrees(w.high)}, low ${degrees(w.low)}${rain}`;
}

/* ---------- planning the requests for an itinerary ---------- */

export type City = { name: string; lat: number; lng: number };
export type DayRef = { date: string; cities: (string | null)[] };
export type Request = { lat: number; lng: number; from: string; to: string };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The destination a day is in: the one most of its stops name, else the first destination that has coordinates.
 * Null when the trip has no destination with coordinates (then there is no weather to show).
 */
export function cityForDay(day: DayRef, cities: City[]): City | null {
  const counts = new Map<string, number>();
  for (const c of day.cities) {
    if (!c) continue;
    const hit = cities.find((x) => norm(x.name) === norm(c));
    if (hit) counts.set(norm(hit.name), (counts.get(norm(hit.name)) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return (best && cities.find((x) => norm(x.name) === best[0])) || cities[0] || null;
}

/**
 * One request per destination covering its days, split so none spans more than MAX_SPAN_DAYS. Days in the past are left out.
 * `placeOf` maps each date to the destination chosen for it, so the caller can look the answer up again.
 */
export function planRequests(days: DayRef[], cities: City[], today: string): { requests: Request[]; placeOf: Map<string, City> } {
  const placeOf = new Map<string, City>();
  const byPlace = new Map<string, { city: City; dates: string[] }>();
  for (const d of days) {
    if (!isIsoDate(d.date) || d.date < today) continue;
    const city = cityForDay(d, cities);
    if (!city || !validCoords(city.lat, city.lng)) continue;
    placeOf.set(d.date, city);
    const key = `${roundCoord(city.lat)},${roundCoord(city.lng)}`;
    const entry = byPlace.get(key) ?? { city, dates: [] };
    entry.dates.push(d.date);
    byPlace.set(key, entry);
  }
  const requests: Request[] = [];
  for (const { city, dates } of byPlace.values()) {
    const sorted = [...new Set(dates)].sort();
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      // A new request when the gap is large (a different visit to the same place) or the span would get too long.
      if (cur === undefined || daysBetween(start, cur) >= MAX_SPAN_DAYS || daysBetween(prev, cur) > 7) {
        requests.push({ lat: roundCoord(city.lat), lng: roundCoord(city.lng), from: start, to: prev });
        start = cur;
      }
    }
  }
  return { requests, placeOf };
}
