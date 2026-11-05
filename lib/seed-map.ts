import { z } from "zod";
import type { Database, TablesInsert } from "@/lib/database.types";

/**
 * Maps the workbook-export JSON (seed/vietnam26.seed.json) onto database rows.
 * Pure: ids are generated up front with `uuid()` so expenses can point at travelers and
 * categories before anything is inserted. Used by scripts/seed.ts, the in-app
 * "Load example" action and the Playwright fixtures.
 */

const s = z.string().nullish();
const n = z.number().nullish();

export const SeedSchema = z.object({
  settings: z.object({
    name: z.string(),
    dest: s,
    start: s,
    end: s,
    home: z.string(),
    foreign: z.string(),
    rate: z.number(),
    budget: n,
    members: z.array(z.string()).default([]),
    cats: z.array(z.string()).default([]),
    planned: z.record(z.string(), z.number()).default({}),
    dests: z.array(z.object({ city: z.string(), country: s, nights: n, lat: n, lng: n })).default([]),
    map_region: s,
  }),
  exp: z.array(z.object({ date: s, desc: z.string(), cat: s, by: s, cur: s, amt: z.number(), note: s })).default([]),
  itin: z
    .array(
      z.object({
        day: n,
        date: s,
        city: s,
        time: s,
        act: z.string(),
        dur: n,
        type: s,
        note: s,
        done: z.boolean().nullish(),
      }),
    )
    .default([]),
  flights: z
    .array(z.object({ from: s, to: s, airline: s, no: s, dep: s, arr: s, fare: n, status: s, ref: s }))
    .default([]),
  stays: z
    .array(z.object({ status: s, city: s, hotel: z.string(), room: s, cin: s, cout: s, total: n, conf: s, note: s }))
    .default([]),
  short: z.array(z.object({ city: s, hotel: z.string(), room: s, nights: n, total: n })).default([]),
  transfers: z.array(z.object({ route: z.string(), provider: s, cost: s, link: s })).default([]),
  food: z.array(z.object({ name: z.string(), city: s, day: n, note: s, status: s })).default([]),
  menu: z.array(z.object({ rest: z.string(), item: z.string(), vnd: n })).default([]),
  att: z.array(z.object({ name: z.string(), city: s, day: n, note: s, status: s })).default([]),
  pack: z.array(z.object({ cat: s, item: z.string(), who: s, packed: z.boolean().nullish() })).default([]),
  pas: z.array(z.object({ who: z.string(), gift: z.string(), budget: n, bought: z.boolean().nullish() })).default([]),
  rem: z.array(z.object({ text: z.string() })).default([]),
});
export type Seed = z.infer<typeof SeedSchema>;

const STATUSES = ["Idea", "Maybe", "Planned", "Priced", "Booked", "Done", "Cancelled"];
const TYPES = ["Transport", "Sightseeing", "Food & Drink", "Rest & Stay", "Activity", "Shopping", "Flight", "Other"];

/** "" and whitespace become null. */
const t = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const status = (v: string | null | undefined) => (v && STATUSES.includes(v) ? v : "Planned");
const date = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const time = (v: string | null | undefined) => (v && /^\d{1,2}:\d{2}/.test(v) ? v : null);

type ChildTable = Exclude<keyof Database["public"]["Tables"], "trips" | "trip_members">;
type Ins<T extends ChildTable> = Omit<TablesInsert<T>, "trip_id"> & { id: string };

export type SeedPlan = {
  trip: {
    name: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    home_currency: string;
    foreign_currency: string;
    rate: number;
    budget: number;
    map_region: string;
  };
  /** Planned amounts for categories that already exist (matched by name). */
  categoryUpdates: { id: string; planned: number | null; sort: number }[];
  rows: {
    travelers: Ins<"travelers">[];
    destinations: Ins<"destinations">[];
    categories: Ins<"categories">[];
    expenses: Ins<"expenses">[];
    itinerary_items: Ins<"itinerary_items">[];
    flights: Ins<"flights">[];
    transfers: Ins<"transfers">[];
    stays: Ins<"stays">[];
    hotel_ideas: Ins<"hotel_ideas">[];
    food_places: Ins<"food_places">[];
    menu_items: Ins<"menu_items">[];
    attractions: Ins<"attractions">[];
    packing_items: Ins<"packing_items">[];
    gifts: Ins<"gifts">[];
    reminders: Ins<"reminders">[];
  };
  /** Things that didn't map 1:1, for the user to know about. */
  notes: string[];
};

/** Insert order that satisfies foreign keys (travelers & categories before expenses). */
export const INSERT_ORDER = [
  "travelers",
  "destinations",
  "categories",
  "expenses",
  "itinerary_items",
  "flights",
  "transfers",
  "stays",
  "hotel_ideas",
  "food_places",
  "menu_items",
  "attractions",
  "packing_items",
  "gifts",
  "reminders",
] as const satisfies readonly (keyof SeedPlan["rows"])[];

export function buildSeedPlan(
  raw: unknown,
  existingCategories: { id: string; name: string }[],
  uuid: () => string = () => crypto.randomUUID(),
): SeedPlan {
  const seed = SeedSchema.parse(raw);
  const st = seed.settings;
  const notes: string[] = [];

  const travelers = st.members.map((name, i) => ({ id: uuid(), name, sort: i }));
  const travelerId = new Map(travelers.map((tr) => [tr.name.toLowerCase(), tr.id]));

  // Categories: reuse the trip's existing ones by name, add any the seed has that are missing.
  const existing = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c.id]));
  const catNames = [
    ...new Set([...st.cats, ...Object.keys(st.planned), ...seed.exp.map((e) => e.cat).filter(Boolean)]),
  ] as string[];
  const categoryUpdates: SeedPlan["categoryUpdates"] = [];
  const categories: Ins<"categories">[] = [];
  const catId = new Map<string, string>();
  catNames.forEach((name, i) => {
    const planned = st.planned[name] ?? null;
    const id = existing.get(name.toLowerCase());
    if (id) {
      categoryUpdates.push({ id, planned, sort: i });
      catId.set(name.toLowerCase(), id);
    } else {
      const row = { id: uuid(), name, planned, sort: i };
      categories.push(row);
      catId.set(name.toLowerCase(), row.id);
    }
  });

  const fallbackDate = date(st.start) ?? new Date().toISOString().slice(0, 10);
  const undated = seed.exp.filter((e) => !date(e.date)).length;
  if (undated) notes.push(`${undated} expense(s) had no date and were placed on the trip start date.`);
  const unknownPayers = new Set(seed.exp.map((e) => e.by).filter((b) => b && !travelerId.has(b.toLowerCase())));
  if (unknownPayers.size) notes.push(`Unknown payer(s) left blank: ${[...unknownPayers].join(", ")}.`);

  const expenses = seed.exp.map((e) => ({
    id: uuid(),
    spent_on: date(e.date) ?? fallbackDate,
    description: e.desc,
    category_id: e.cat ? (catId.get(e.cat.toLowerCase()) ?? null) : null,
    paid_by: e.by ? (travelerId.get(e.by.toLowerCase()) ?? null) : null,
    currency: (t(e.cur) ?? st.home).toUpperCase(),
    amount: e.amt,
    note: date(e.date) ? t(e.note) : [t(e.note), "Date not recorded"].filter(Boolean).join(" · "),
  }));

  const badTypes = new Set(seed.itin.map((i) => i.type).filter((ty) => ty && !TYPES.includes(ty)));
  if (badTypes.size) notes.push(`Itinerary types mapped to "Other": ${[...badTypes].join(", ")}.`);

  return {
    trip: {
      name: st.name,
      destination: t(st.dest),
      start_date: date(st.start),
      end_date: date(st.end),
      home_currency: st.home.toUpperCase(),
      foreign_currency: st.foreign.toUpperCase(),
      rate: st.rate,
      budget: st.budget ?? 0,
      map_region: t(st.map_region) ?? "world",
    },
    categoryUpdates,
    notes,
    rows: {
      travelers,
      destinations: st.dests.map((d, i) => ({
        id: uuid(),
        city: d.city,
        country: t(d.country),
        nights: d.nights ?? 0,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        sort: i,
      })),
      categories,
      expenses,
      itinerary_items: seed.itin.map((i) => ({
        id: uuid(),
        day: i.day ?? null,
        on_date: date(i.date),
        city: t(i.city),
        at_time: time(i.time),
        activity: i.act,
        type: i.type && TYPES.includes(i.type) ? i.type : i.type ? "Other" : null,
        duration_min: i.dur ?? null,
        note: t(i.note),
        done: i.done ?? false,
      })),
      flights: seed.flights.map((f) => ({
        id: uuid(),
        from_code: t(f.from),
        to_code: t(f.to),
        airline: t(f.airline),
        flight_no: t(f.no),
        departs_at: t(f.dep),
        arrives_at: t(f.arr),
        fare: f.fare ?? null,
        status: status(f.status),
        booking_ref: t(f.ref),
      })),
      transfers: seed.transfers.map((x) => ({
        id: uuid(),
        route: x.route,
        provider: t(x.provider),
        cost_text: t(x.cost),
        link: t(x.link),
      })),
      stays: seed.stays.map((x) => ({
        id: uuid(),
        status: status(x.status),
        city: t(x.city),
        hotel: x.hotel,
        room: t(x.room),
        check_in: date(x.cin),
        check_out: date(x.cout),
        total: x.total ?? null,
        confirmation: t(x.conf),
        note: t(x.note),
      })),
      hotel_ideas: seed.short.map((x) => ({
        id: uuid(),
        city: t(x.city),
        hotel: x.hotel,
        room: t(x.room),
        nights: x.nights ?? null,
        total: x.total ?? null,
      })),
      food_places: seed.food.map((x) => ({
        id: uuid(),
        name: x.name,
        city: t(x.city),
        day: x.day ?? null,
        note: t(x.note),
        status: status(x.status),
      })),
      menu_items: seed.menu.map((x) => ({
        id: uuid(),
        restaurant: x.rest,
        dish: x.item,
        price_foreign: x.vnd ?? null,
      })),
      attractions: seed.att.map((x) => ({
        id: uuid(),
        name: x.name,
        city: t(x.city),
        day: x.day ?? null,
        note: t(x.note),
        status: status(x.status),
      })),
      packing_items: seed.pack.map((x) => ({
        id: uuid(),
        category: t(x.cat),
        item: x.item,
        whose: t(x.who),
        packed: x.packed ?? false,
      })),
      gifts: seed.pas.map((x) => ({
        id: uuid(),
        for_whom: x.who,
        gift: x.gift,
        budget: x.budget ?? null,
        bought: x.bought ?? false,
      })),
      reminders: seed.rem.map((x) => ({ id: uuid(), text: x.text })),
    },
  };
}
