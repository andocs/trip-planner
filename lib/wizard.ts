import { addDays, daysBetween, localISODate, tripNights } from "@/lib/calc";

/** Pure rules behind the onboarding wizard (unit-tested). */

export type WizardStop = {
  key: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  nights: number;
};

export const MAX_NIGHTS = 60;

export const totalNights = (stops: { nights: number }[]) => stops.reduce((n, s) => n + s.nights, 0);

/** A gentle hint when the stops' nights don't add up to the trip length. Never blocks. */
export function nightsHint(stops: { nights: number }[], start: string | null, end: string | null): string | null {
  const trip = tripNights(start, end);
  if (trip === null || stops.length === 0) return null;
  const stay = totalNights(stops);
  if (stay === trip) return null;
  return stay < trip
    ? `Your stops cover ${stay} of ${trip} nights. Extra nights are fine for travel days.`
    : `Your stops add up to ${stay} nights, but the trip is ${trip}. You can adjust either one.`;
}

/** "Hanoi '26": the first stop and the start year (or this year when no date is set). */
export function defaultTripName(stops: { name: string }[], start: string | null, today = localISODate()): string {
  const first = stops[0]?.name?.trim();
  if (!first) return "My Trip";
  const year = (start ?? today).slice(2, 4);
  return `${first} ’${year}`.replace("’", "'");
}

/** A GeoChart region code when every stop is in one country, otherwise "world". */
export function mapRegionFor(stops: { countryCode: string | null }[]): string {
  const codes = new Set(stops.map((s) => s.countryCode?.toUpperCase()).filter(Boolean));
  return codes.size === 1 ? [...codes][0]! : "world";
}

export function destinationFor(stops: { name: string; country: string | null }[]): string | null {
  if (stops.length === 0) return null;
  const countries = new Set(stops.map((s) => s.country).filter(Boolean));
  return countries.size === 1 ? [...countries][0]! : stops[0].name;
}

/** Pick a day on the range calendar. First tap sets the start; the next later day sets the end. */
export function pickRange(
  start: string | null,
  end: string | null,
  day: string,
): { start: string; end: string | null } {
  if (!start || end) return { start: day, end: null };
  if (daysBetween(start, day) < 0) return { start: day, end: null };
  return { start, end: day };
}

/** Weeks (Monday first) of a month as ISO dates; days outside the month are null. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++)
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const moveDay = (iso: string, by: number) => addDays(iso, by);

/** Names of currencies for the picker, from the browser's ISO list. */
export function currencyOptions(): { code: string; name: string }[] {
  let codes: string[] = [];
  try {
    codes = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("currency");
  } catch {
    codes = ["PHP", "USD", "EUR", "GBP", "JPY", "VND", "THB", "SGD", "AUD", "KRW", "IDR", "MYR", "HKD", "CNY"];
  }
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return codes.map((code) => ({ code, name: names.of(code) ?? code }));
}

export const isCurrencyCode = (s: string) => /^[A-Z]{3}$/.test(s);

/** "100,000 VND ≈ PHP 245.70" */
export function ratePreview(rate: number, from: string, to: string, amount = 100_000): string | null {
  if (!(rate > 0) || !isCurrencyCode(from) || !isCurrencyCode(to)) return null;
  const n = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${n(amount)} ${from} ≈ ${to} ${n(amount * rate, 2)}`;
}
