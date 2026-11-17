/**
 * Time zones. A flight's times are local wall-clock times at each airport ("2026-06-18T09:40" in Manila); with the zone of
 * each end the real travel time can be worked out. Pure (Intl only): no network, no dependency.
 */

/** The home zone. Used for the trip, and as the starting choice for anything that has a time. */
export const DEFAULT_TIMEZONE = "Asia/Manila";

export type Zone = { id: string; city: string; country: string };

/** The zones offered in pickers: the places this trip planner is likely to meet. Any other IANA id is still accepted. */
export const ZONES: Zone[] = [
  { id: "Asia/Manila", city: "Manila", country: "Philippines" },
  { id: "Asia/Singapore", city: "Singapore", country: "Singapore" },
  { id: "Asia/Hong_Kong", city: "Hong Kong", country: "Hong Kong" },
  { id: "Asia/Taipei", city: "Taipei", country: "Taiwan" },
  { id: "Asia/Tokyo", city: "Tokyo / Osaka", country: "Japan" },
  { id: "Asia/Seoul", city: "Seoul", country: "South Korea" },
  { id: "Asia/Shanghai", city: "Shanghai / Beijing", country: "China" },
  { id: "Asia/Ho_Chi_Minh", city: "Hanoi / Ho Chi Minh City", country: "Vietnam" },
  { id: "Asia/Bangkok", city: "Bangkok", country: "Thailand" },
  { id: "Asia/Jakarta", city: "Jakarta", country: "Indonesia" },
  { id: "Asia/Makassar", city: "Bali / Makassar", country: "Indonesia" },
  { id: "Asia/Kuala_Lumpur", city: "Kuala Lumpur", country: "Malaysia" },
  { id: "Asia/Kolkata", city: "Delhi / Mumbai", country: "India" },
  { id: "Asia/Dhaka", city: "Dhaka", country: "Bangladesh" },
  { id: "Asia/Dubai", city: "Dubai", country: "UAE" },
  { id: "Asia/Qatar", city: "Doha", country: "Qatar" },
  { id: "Europe/Istanbul", city: "Istanbul", country: "Türkiye" },
  { id: "Europe/London", city: "London", country: "United Kingdom" },
  { id: "Europe/Paris", city: "Paris", country: "France" },
  { id: "Europe/Amsterdam", city: "Amsterdam", country: "Netherlands" },
  { id: "Europe/Berlin", city: "Berlin / Frankfurt", country: "Germany" },
  { id: "Europe/Zurich", city: "Zurich", country: "Switzerland" },
  { id: "Europe/Rome", city: "Rome", country: "Italy" },
  { id: "Europe/Madrid", city: "Madrid", country: "Spain" },
  { id: "Europe/Athens", city: "Athens", country: "Greece" },
  { id: "Atlantic/Reykjavik", city: "Reykjavik", country: "Iceland" },
  { id: "Africa/Cairo", city: "Cairo", country: "Egypt" },
  { id: "Africa/Johannesburg", city: "Johannesburg", country: "South Africa" },
  { id: "Africa/Nairobi", city: "Nairobi", country: "Kenya" },
  { id: "Australia/Sydney", city: "Sydney / Melbourne", country: "Australia" },
  { id: "Australia/Perth", city: "Perth", country: "Australia" },
  { id: "Pacific/Auckland", city: "Auckland", country: "New Zealand" },
  { id: "Pacific/Honolulu", city: "Honolulu", country: "United States" },
  { id: "America/Los_Angeles", city: "Los Angeles", country: "United States" },
  { id: "America/Denver", city: "Denver", country: "United States" },
  { id: "America/Chicago", city: "Chicago", country: "United States" },
  { id: "America/New_York", city: "New York", country: "United States" },
  { id: "America/Vancouver", city: "Vancouver", country: "Canada" },
  { id: "America/Toronto", city: "Toronto", country: "Canada" },
  { id: "America/Mexico_City", city: "Mexico City", country: "Mexico" },
  { id: "America/Bogota", city: "Bogotá", country: "Colombia" },
  { id: "America/Lima", city: "Lima", country: "Peru" },
  { id: "America/Sao_Paulo", city: "São Paulo", country: "Brazil" },
  { id: "America/Argentina/Buenos_Aires", city: "Buenos Aires", country: "Argentina" },
  { id: "UTC", city: "UTC", country: "Universal time" },
];

export function isValidTimezone(id: string | null | undefined): id is string {
  if (!id) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/** The zone to use: the given one if it is a real zone, else the default. */
export const zoneOrDefault = (id: string | null | undefined): string => (isValidTimezone(id) ? id : DEFAULT_TIMEZONE);

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** The zone's offset from UTC, in minutes, at a given instant. */
function offsetAt(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant (ms since epoch) of a local wall-clock "YYYY-MM-DDTHH:mm" in a zone; null if it isn't a timestamp. */
export function instantOf(local: string | null | undefined, zone: string): number | null {
  const m = local ? LOCAL.exec(local) : null;
  if (!m || !isValidTimezone(zone)) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // Two passes: the offset at the guess may differ from the offset at the real instant around a clock change.
  let guess = wall - offsetAt(wall, zone) * 60000;
  guess = wall - offsetAt(guess, zone) * 60000;
  return guess;
}

/** Minutes between two local times in their own zones; null when either is missing, or the result isn't a believable flight. */
export function travelMinutes(
  depart: { local: string | null | undefined; zone: string | null | undefined },
  arrive: { local: string | null | undefined; zone: string | null | undefined },
): number | null {
  const a = instantOf(depart.local, zoneOrDefault(depart.zone));
  const b = instantOf(arrive.local, zoneOrDefault(arrive.zone));
  if (a === null || b === null) return null;
  const min = Math.round((b - a) / 60000);
  // Under a minute or over 36 hours is far more likely a wrong zone or date than a real flight.
  return min > 0 && min <= 36 * 60 ? min : null;
}

/** "GMT+8", "GMT-5", "GMT+5:30" for a zone at a local time (daylight saving included). */
export function gmtLabel(zone: string, atLocal?: string | null): string {
  const z = zoneOrDefault(zone);
  const ms = (atLocal ? instantOf(atLocal, z) : null) ?? Date.now();
  const off = offsetAt(ms, z);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "Manila" for a known zone, else the last part of the id ("Asia/Phnom_Penh" gives "Phnom Penh"). */
export function zoneCity(id: string): string {
  return ZONES.find((z) => z.id === id)?.city ?? id.split("/").pop()!.replace(/_/g, " ");
}

/** Zones of common airports, to suggest a zone when a code is typed. A suggestion only: the owner can always change it. */
const AIRPORT_ZONE: Record<string, string> = {
  MNL: "Asia/Manila", CEB: "Asia/Manila", CRK: "Asia/Manila", DVO: "Asia/Manila", ILO: "Asia/Manila", KLO: "Asia/Manila",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", TPE: "Asia/Taipei", TSA: "Asia/Taipei",
  NRT: "Asia/Tokyo", HND: "Asia/Tokyo", KIX: "Asia/Tokyo", ITM: "Asia/Tokyo", NGO: "Asia/Tokyo", FUK: "Asia/Tokyo", CTS: "Asia/Tokyo", OKA: "Asia/Tokyo",
  ICN: "Asia/Seoul", GMP: "Asia/Seoul", PUS: "Asia/Seoul", PVG: "Asia/Shanghai", PEK: "Asia/Shanghai", CAN: "Asia/Shanghai",
  HAN: "Asia/Ho_Chi_Minh", SGN: "Asia/Ho_Chi_Minh", DAD: "Asia/Ho_Chi_Minh", PQC: "Asia/Ho_Chi_Minh", CXR: "Asia/Ho_Chi_Minh",
  BKK: "Asia/Bangkok", DMK: "Asia/Bangkok", HKT: "Asia/Bangkok", CNX: "Asia/Bangkok",
  CGK: "Asia/Jakarta", DPS: "Asia/Makassar", KUL: "Asia/Kuala_Lumpur", DEL: "Asia/Kolkata", BOM: "Asia/Kolkata", DAC: "Asia/Dhaka",
  DXB: "Asia/Dubai", AUH: "Asia/Dubai", DOH: "Asia/Qatar", IST: "Europe/Istanbul",
  LHR: "Europe/London", LGW: "Europe/London", CDG: "Europe/Paris", AMS: "Europe/Amsterdam", FRA: "Europe/Berlin", MUC: "Europe/Berlin",
  ZRH: "Europe/Zurich", FCO: "Europe/Rome", MAD: "Europe/Madrid", ATH: "Europe/Athens", KEF: "Atlantic/Reykjavik",
  CAI: "Africa/Cairo", JNB: "Africa/Johannesburg", NBO: "Africa/Nairobi",
  SYD: "Australia/Sydney", MEL: "Australia/Sydney", PER: "Australia/Perth", AKL: "Pacific/Auckland",
  HNL: "Pacific/Honolulu", LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles", DEN: "America/Denver",
  ORD: "America/Chicago", JFK: "America/New_York", EWR: "America/New_York", YVR: "America/Vancouver", YYZ: "America/Toronto",
  MEX: "America/Mexico_City", BOG: "America/Bogota", LIM: "America/Lima", GRU: "America/Sao_Paulo", EZE: "America/Argentina/Buenos_Aires",
};

/** The zone of an airport code ("kix" gives "Asia/Tokyo"), or null when the code isn't one we know. */
export const zoneForAirport = (code: string | null | undefined): string | null => AIRPORT_ZONE[(code ?? "").trim().toUpperCase()] ?? null;
