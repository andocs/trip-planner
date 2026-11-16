import { daysBetween } from "./calc";
import type { Idea } from "./drafts";
import { parseDetails } from "./idea-details";
import { dateForDay, dayOf, dayTotals, formatTotal, LONG_DAY_MINUTES, type Item } from "./itinerary";
import { isBooked, parseStayDetails } from "./stay-details";

/**
 * Reminders worked out from what is already in the plan, so there is nothing extra to type or store:
 *  - a booked stay: check-in today or tomorrow, a free-cancellation deadline in the next few days,
 *    a stay that still is not booked while check-in is within a month;
 *  - a confirmed food place or sight that needs a reservation or tickets that are not booked yet;
 *  - a day in the coming week whose plan adds up to more than the long-day limit (see LONG_DAY_MINUTES).
 * Pure: `today` is passed in (YYYY-MM-DD) so the server and the browser agree on the words.
 * A missing commute between two places is not a reminder: most neighbouring places need none, so it would only nag.
 */
export type ReminderIcon = "BedDouble" | "ShieldCheck" | "CalendarClock" | "Ticket" | "Utensils" | "TriangleAlert";
export type AutoReminder = {
  /** Stable, so a dismissal sticks: `<kind>:<source id>`. */
  id: string;
  kind: "checkin" | "cancel" | "unbooked" | "tickets" | "reservation" | "longday";
  title: string;
  detail: string;
  tone: "due" | "warn";
  icon: ReminderIcon;
  href: string;
  /** Days until it matters (0 = today). Undated reminders sort last. */
  days: number;
};

type StayLike = {
  id: string;
  hotel: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  details: unknown;
};

const NO_DATE = 10_000;
/** How far ahead an unbooked stay starts to nag, and how close a free-cancellation deadline has to be. */
export const UNBOOKED_WITHIN_DAYS = 30;
export const CANCEL_WITHIN_DAYS = 3;
/** A packed day only matters in the week before it, so a trip planned months ahead does not flood Home. */
export const LONG_DAY_WITHIN_DAYS = 7;

const when = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

export function autoReminders(
  input: { stays: StayLike[]; ideas: Idea[]; items?: Item[]; start?: string | null },
  today: string,
): AutoReminder[] {
  const out: AutoReminder[] = [];

  for (const s of input.stays) {
    if (s.status === "Cancelled") continue;
    const stayed = s.check_out !== null && daysBetween(today, s.check_out) < 0;
    if (stayed) continue;
    const d = parseStayDetails(s.details);

    if (s.check_in) {
      const toCheckIn = daysBetween(today, s.check_in);
      if (toCheckIn === 0 || toCheckIn === 1)
        out.push({ id: `checkin:${s.id}`, kind: "checkin", title: `Check-in ${when(toCheckIn)}`, detail: s.hotel, tone: "due", icon: "BedDouble", href: "/stays", days: toCheckIn });
      if (!isBooked(s.status) && toCheckIn >= 0 && toCheckIn <= UNBOOKED_WITHIN_DAYS)
        out.push({ id: `unbooked:${s.id}`, kind: "unbooked", title: "Not booked yet", detail: `${s.hotel} · check-in ${when(toCheckIn)}`, tone: "warn", icon: "CalendarClock", href: "/stays", days: toCheckIn });
    }

    if (d.cancellation === "free" && d.freeUntil) {
      const left = daysBetween(today, d.freeUntil);
      if (left >= 0 && left <= CANCEL_WITHIN_DAYS)
        out.push({ id: `cancel:${s.id}`, kind: "cancel", title: `Free cancellation ends ${when(left)}`, detail: s.hotel, tone: "warn", icon: "ShieldCheck", href: "/stays", days: left });
    }
  }

  for (const i of input.ideas) {
    if (i.decision !== "confirmed" || i.kind === "stay") continue;
    const d = parseDetails(i.kind, i.details);
    const href = `/places?cat=${i.kind}&idea=${i.key}`;
    if (i.kind === "sight" && d.ticketsNeeded && !d.ticketsBooked)
      out.push({ id: `tickets:${i.key}`, kind: "tickets", title: "Tickets needed", detail: i.name, tone: "warn", icon: "Ticket", href, days: NO_DATE });
    if (i.kind === "food" && d.reservationNeeded && !d.reservationBooked)
      out.push({ id: `reservation:${i.key}`, kind: "reservation", title: "Reservation needed", detail: i.name, tone: "warn", icon: "Utensils", href, days: NO_DATE });
  }

  // Days from today on whose plan (places, commutes and breaks) is over the long-day limit.
  const byDay = new Map<number, Item[]>();
  for (const it of input.items ?? []) {
    const d = dayOf(it, input.start);
    if (d !== null) byDay.set(d, [...(byDay.get(d) ?? []), it]);
  }
  for (const [day, list] of byDay) {
    const date = dateForDay(input.start, day);
    if (!date) continue;
    const away = daysBetween(today, date);
    const totals = dayTotals(list);
    if (away >= 0 && away <= LONG_DAY_WITHIN_DAYS && totals.long)
      out.push({
        id: `longday:${day}`,
        kind: "longday",
        title: `Day ${day} is packed`,
        detail: `${formatTotal(totals.total)} planned, over ${LONG_DAY_MINUTES / 60}h`,
        tone: "warn",
        icon: "TriangleAlert",
        href: "/itinerary",
        days: away,
      });
  }

  const order = ["checkin", "cancel", "longday", "unbooked", "tickets", "reservation"];
  return out.sort((a, b) => a.days - b.days || order.indexOf(a.kind) - order.indexOf(b.kind) || a.detail.localeCompare(b.detail));
}
