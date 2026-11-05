import {
  homeAmount,
  menuHomePrice,
  pricePerNight,
  settleUp,
  spentByCategory,
  stayNights,
  totalSpent,
} from "@/lib/calc";
import type { Tables } from "@/lib/database.types";

/** Everything the export needs, already loaded. */
export type ExportData = {
  trip: Tables<"trips">;
  travelers: Tables<"travelers">[];
  destinations: Tables<"destinations">[];
  categories: Tables<"categories">[];
  expenses: Tables<"expenses">[];
  itinerary_items: Tables<"itinerary_items">[];
  flights: Tables<"flights">[];
  transfers: Tables<"transfers">[];
  stays: Tables<"stays">[];
  hotel_ideas: Tables<"hotel_ideas">[];
  food_places: Tables<"food_places">[];
  menu_items: Tables<"menu_items">[];
  attractions: Tables<"attractions">[];
  packing_items: Tables<"packing_items">[];
  gifts: Tables<"gifts">[];
  reminders: Tables<"reminders">[];
};

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const n = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const byDate =
  <T extends { created_at: string }>(key: (r: T) => string | null) =>
  (a: T, b: T) =>
    (key(a) ?? "9").localeCompare(key(b) ?? "9") || a.created_at.localeCompare(b.created_at);

/**
 * Builds the workbook as plain rows, one sheet per workbook tab. Pure (no SheetJS), so it's
 * unit-tested; `downloadWorkbook` turns it into an .xlsx.
 */
export function buildWorkbook(d: ExportData): Sheet[] {
  const t = d.trip;
  const home = t.home_currency;
  const foreign = t.foreign_currency;
  const traveler = new Map(d.travelers.map((x) => [x.id, x.name]));
  const category = new Map(d.categories.map((x) => [x.id, x.name]));
  const spent = totalSpent(d.expenses, t);
  const byCat = spentByCategory(d.expenses, t);
  const settle = settleUp(d.expenses, d.travelers, t);

  return [
    {
      name: "Trip",
      rows: [
        ["Trip", t.name],
        ["Destination", t.destination],
        ["Start", t.start_date],
        ["End", t.end_date],
        ["Home currency", home],
        ["Foreign currency", foreign],
        [`Rate (1 ${foreign} in ${home})`, n(t.rate)],
        ["Budget", n(t.budget)],
        ["Travelers", d.travelers.map((x) => x.name).join(", ")],
        [],
        ["City", "Country", "Nights", "Latitude", "Longitude"],
        ...d.destinations.map((x) => [x.city, x.country, x.nights, n(x.lat), n(x.lng)]),
      ],
    },
    {
      name: "Budget",
      rows: [
        ["Category", `Planned (${home})`, `Spent (${home})`, `Left (${home})`],
        ...d.categories.map((c) => {
          const s = byCat.get(c.id) ?? 0;
          const p = n(c.planned);
          return [c.name, p, r2(s), p === null ? null : r2(p - s)];
        }),
        ["Total", null, r2(spent), r2(Number(t.budget) - spent)],
        [],
        ["Settle up", "Paid", "Fair share", "Balance"],
        ...settle.rows.map((r) => [r.traveler.name, r.paid, r.share, r.balance]),
        [],
        ["From", "To", `Amount (${home})`],
        ...settle.transfers.map((x) => [x.from.name, x.to.name, x.amount]),
      ],
    },
    {
      name: "Expenses",
      rows: [
        ["Date", "Description", "Category", "Paid by", "Currency", "Amount", `Amount (${home})`, "Note"],
        ...[...d.expenses]
          .sort(byDate((e) => e.spent_on))
          .map((e) => [
            e.spent_on,
            e.description,
            e.category_id ? (category.get(e.category_id) ?? null) : null,
            e.paid_by ? (traveler.get(e.paid_by) ?? null) : null,
            e.currency,
            n(e.amount),
            r2(homeAmount(e, t)),
            e.note,
          ]),
      ],
    },
    {
      name: "Itinerary",
      rows: [
        ["Day", "Date", "City", "Time", "Activity", "Type", "Duration (min)", "Done", "Note"],
        ...[...d.itinerary_items]
          .sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || (a.at_time ?? "99").localeCompare(b.at_time ?? "99"))
          .map((i) => [
            i.day,
            i.on_date,
            i.city,
            i.at_time?.slice(0, 5) ?? null,
            i.activity,
            i.type,
            i.duration_min,
            i.done,
            i.note,
          ]),
      ],
    },
    {
      name: "Flights",
      rows: [
        [
          "From",
          "To",
          "Airline",
          "Flight",
          "Departs (local)",
          "Arrives (local)",
          `Fare (${home})`,
          "Status",
          "Booking ref",
        ],
        ...[...d.flights]
          .sort(byDate((f) => f.departs_at))
          .map((f) => [
            f.from_code,
            f.to_code,
            f.airline,
            f.flight_no,
            f.departs_at?.slice(0, 16).replace("T", " ") ?? null,
            f.arrives_at?.slice(0, 16).replace("T", " ") ?? null,
            n(f.fare),
            f.status,
            f.booking_ref,
          ]),
        [],
        ["Transfer route", "Provider", "Cost", "Link"],
        ...d.transfers.map((x) => [x.route, x.provider, x.cost_text, x.link]),
      ],
    },
    {
      name: "Stays",
      rows: [
        [
          "Status",
          "City",
          "Hotel",
          "Room",
          "Check-in",
          "Check-out",
          "Nights",
          `Total (${home})`,
          "Per night",
          "Confirmation",
          "Note",
        ],
        ...[...d.stays].sort(byDate((s) => s.check_in)).map((s) => {
          const nights = stayNights(s.check_in, s.check_out);
          return [
            s.status,
            s.city,
            s.hotel,
            s.room,
            s.check_in,
            s.check_out,
            nights,
            n(s.total),
            r2(pricePerNight(s.total, nights)),
            s.confirmation,
            s.note,
          ];
        }),
        [],
        ["Hotel ideas: City", "Hotel", "Room", "Nights", `Total (${home})`, "Per night"],
        ...d.hotel_ideas.map((h) => [
          h.city,
          h.hotel,
          h.room,
          h.nights,
          n(h.total),
          r2(pricePerNight(h.total, h.nights)),
        ]),
      ],
    },
    {
      name: "Food",
      rows: [
        ["Name", "City", "Day", "Status", "Note"],
        ...d.food_places.map((f) => [f.name, f.city, f.day, f.status, f.note]),
        [],
        ["Menu: Restaurant", "Dish", `Price (${foreign})`, `≈ ${home}`],
        ...d.menu_items.map((m) => [
          m.restaurant,
          m.dish,
          n(m.price_foreign),
          r2(menuHomePrice(m.price_foreign, t.rate)),
        ]),
      ],
    },
    {
      name: "Attractions",
      rows: [
        ["Name", "City", "Day", "Status", "Note"],
        ...d.attractions.map((a) => [a.name, a.city, a.day, a.status, a.note]),
      ],
    },
    {
      name: "Packing",
      rows: [
        ["Category", "Item", "Whose", "Packed"],
        ...d.packing_items.map((p) => [p.category, p.item, p.whose, p.packed]),
        [],
        ["Pasalubong: For", "Gift", `Budget (${home})`, "Bought"],
        ...d.gifts.map((g) => [g.for_whom, g.gift, n(g.budget), g.bought]),
        [],
        ["Reminders"],
        ...d.reminders.map((r) => [r.text]),
      ],
    },
  ];
}

export function exportFileName(tripName: string) {
  const safe = tripName.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Trip";
  return `${safe}.xlsx`;
}

/** Lazy-loads SheetJS and downloads the workbook. Browser only. */
export async function downloadWorkbook(d: ExportData) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of buildWorkbook(d)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    const widths = sheet.rows.reduce<number[]>((w, row) => {
      row.forEach((c, i) => (w[i] = Math.min(60, Math.max(w[i] ?? 8, String(c ?? "").length + 2))));
      return w;
    }, []);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, exportFileName(d.trip.name));
}
