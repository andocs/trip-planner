import type { Tables } from "@/lib/database.types";
import { saveTextFile } from "@/lib/download";
import { exportFileName } from "@/lib/export";
import { dateForDay, dayOf, isStop } from "@/lib/itinerary";
import { instantOf, zoneForAirport, zoneOrDefault } from "@/lib/timezones";

/** What the calendar file needs, already loaded (a slice of the Excel export's data). */
export type IcsData = {
  trip: Tables<"trips">;
  itinerary_items: Tables<"itinerary_items">[];
  flights: Tables<"flights">[];
  stays: Tables<"stays">[];
};

const CRLF = "\r\n";

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded (continuation lines start with one space), never inside a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join(CRLF + " ");
}

const pad = (v: number, w = 2) => String(v).padStart(w, "0");
/** "2026-06-18" -> "20260618". */
const dateValue = (d: string) => d.replaceAll("-", "");
/** Epoch ms -> "20260618T014000Z". */
function utcValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
/** "2026-06-18T09:40" -> "20260618T094000" (a floating time: the same wall clock wherever the calendar is opened). */
const floatingValue = (local: string) => local.replace(/[-:]/g, "").slice(0, 15).padEnd(15, "0");

/** The calendar day after a "YYYY-MM-DD" date (all-day events end on the day after they last). */
function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "09:30" or "09:30:00" -> "09:30"; null when it isn't a time. */
const hhmm = (t: string | null | undefined): string | null => /^(\d{2}):(\d{2})/.exec(t ?? "")?.slice(1, 3).join(":") ?? null;

type Prop = [string, string];
function event(uid: string, stamp: string, props: Prop[]): string[] {
  return ["BEGIN:VEVENT", `UID:${uid}@trip-planner`, `DTSTAMP:${stamp}`, ...props.map(([k, v]) => `${k}:${v}`), "END:VEVENT"];
}

/**
 * Builds an iCalendar (.ics) file for the trip: activities, flights and stays.
 * - Activities with a time are floating local times (the trip's own wall clock); without a time they are all-day.
 * - Flights are real instants (UTC) when both airports' time zones are known, otherwise floating.
 * - Stays are all-day events from check-in to check-out.
 * - Booking references, confirmation numbers and prices are never included: the file gets forwarded.
 * Pure: `now` is a parameter so the output is testable.
 */
export function buildIcs(d: IcsData, now: Date = new Date()): string {
  const stamp = utcValue(now.getTime());
  const start = d.trip.start_date;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(d.trip.name)}`,
  ];

  for (const i of d.itinerary_items.filter(isStop)) {
    const day = dayOf(i, start);
    const date = dateForDay(start, day) ?? i.on_date;
    if (!date) continue; // no way to place it on a calendar
    const time = hhmm(i.at_time);
    const props: Prop[] = [["SUMMARY", esc(i.activity)]];
    if (time) {
      props.push(["DTSTART", floatingValue(`${date}T${time}`)]);
      props.push(["DURATION", `PT${Math.max(1, i.duration_min ?? 60)}M`]);
    } else {
      props.push(["DTSTART;VALUE=DATE", dateValue(date)], ["DTEND;VALUE=DATE", dateValue(nextDay(date))]);
    }
    if (i.city) props.push(["LOCATION", esc(i.city)]);
    if (i.note) props.push(["DESCRIPTION", esc(i.note)]);
    if (i.tentative) props.push(["STATUS", "TENTATIVE"]);
    lines.push(...event(`item-${i.id}`, stamp, props));
  }

  for (const f of d.flights) {
    if (!f.departs_at) continue;
    const route = [f.from_code, f.to_code].filter(Boolean).join(" → ");
    const label = [f.airline, f.flight_no].filter(Boolean).join(" ");
    const depZone = f.dep_tz ?? zoneForAirport(f.from_code);
    const arrZone = f.arr_tz ?? zoneForAirport(f.to_code);
    const dep = depZone ? instantOf(f.departs_at, zoneOrDefault(depZone)) : null;
    const arr = f.arrives_at && arrZone ? instantOf(f.arrives_at, zoneOrDefault(arrZone)) : null;
    const props: Prop[] = [["SUMMARY", esc(`Flight: ${[label, route].filter(Boolean).join(" · ") || "Flight"}`)]];
    if (dep !== null && arr !== null && arr > dep) {
      props.push(["DTSTART", utcValue(dep)], ["DTEND", utcValue(arr)]);
    } else {
      props.push(["DTSTART", floatingValue(f.departs_at)]);
      if (f.arrives_at) props.push(["DTEND", floatingValue(f.arrives_at)]);
    }
    const extra = [f.terminal && `Terminal ${f.terminal}`, f.gate && `Gate ${f.gate}`, f.seat && `Seat ${f.seat}`].filter(Boolean);
    if (extra.length) props.push(["DESCRIPTION", esc(extra.join(", "))]);
    lines.push(...event(`flight-${f.id}`, stamp, props));
  }

  for (const s of d.stays) {
    if (!s.check_in) continue;
    const out = s.check_out && s.check_out > s.check_in ? s.check_out : nextDay(s.check_in);
    const props: Prop[] = [
      ["SUMMARY", esc(`Stay: ${s.hotel}`)],
      ["DTSTART;VALUE=DATE", dateValue(s.check_in)],
      ["DTEND;VALUE=DATE", dateValue(out)],
    ];
    if (s.city) props.push(["LOCATION", esc(s.city)]);
    lines.push(...event(`stay-${s.id}`, stamp, props));
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Browser only: saves the calendar file. */
export function downloadIcs(d: IcsData) {
  saveTextFile(exportFileName(d.trip.name).replace(/\.xlsx$/, ".ics"), "text/calendar", buildIcs(d));
}
