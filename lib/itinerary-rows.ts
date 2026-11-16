import type { Idea } from "./drafts";
import { formatMoney } from "./format";
import { cardChips, UNIT_LABEL } from "./idea-details";
import { timeLine, type Item } from "./itinerary";

/** One line of a place card: an icon name (see CHIP_ICONS), a bold value and a small label under it. */
export type StopRow = { icon: string; value: string; label: string; tone?: "ok" | "warn" };

const CHIP_LABEL: Record<string, string> = {
  tickets: "Tickets",
  reserve: "Reservation",
  booking: "Booking",
  cancel: "Cancellation",
  nights: "Stay",
  queue: "Queue",
  duration: "Length",
  type: "Type",
  effort: "Effort",
  weather: "Outdoors",
  pay: "Payment",
  meal: "Meal",
  band: "Price",
};

const isLink = (s: string) => /^https?:\/\//i.test(s.trim());

/**
 * The three lines a place shows on the itinerary, in a fixed order so every card reads the same:
 * 1 when (time and length), 2 what it costs, 3 the one fact that matters most (a booking still to do, the
 * cancellation terms, the queue ...), falling back to its note or area. Uses the board idea it came from, if any.
 */
export function stopRows(item: Pick<Item, "at_time" | "duration_min"> & { note?: string | null }, idea: Idea | undefined, currency: string): StopRow[] {
  const rows: StopRow[] = [{ icon: "Clock", value: timeLine(item), label: "Time" }];

  if (idea && idea.price !== null) {
    const unit = idea.priceUnit ? ` ${UNIT_LABEL[idea.priceUnit]}` : "";
    rows.push({ icon: "Coins", value: `${formatMoney(idea.price, currency)}${unit}`, label: idea.kind === "sight" ? "Entrance" : "Price" });
  }

  const chip = idea ? cardChips(idea, currency).find((c) => c.key !== "nights" || rows.length < 3) : undefined;
  if (chip && rows.length < 3) rows.push({ icon: chip.icon, value: chip.label, label: CHIP_LABEL[chip.key] ?? "Info", tone: chip.tone });

  const note = item.note && !isLink(item.note) ? item.note.split("\n")[0].trim() : "";
  if (rows.length < 3 && note) rows.push({ icon: "Info", value: note.length > 60 ? `${note.slice(0, 57)}...` : note, label: "Note" });
  if (rows.length < 3 && idea?.city) rows.push({ icon: "MapPin", value: idea.city, label: "Area" });
  return rows.slice(0, 3);
}
