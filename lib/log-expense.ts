/** Pure helpers for "Log as expense": what the expense should look like, and which category it belongs in. */

/** Matches expenses.source_table: a stay is a booked hotel idea (migration 31). */
export type LoggableKind = "flights" | "hotel_ideas";

type FlightLike = {
  from_code: string | null;
  to_code: string | null;
  airline: string | null;
  flight_no: string | null;
  fare: number | null;
};
type StayLike = { hotel: string; city: string | null; total: number | null };
type CategoryLike = { id: string; name: string };

const CATEGORY_NAME: Record<LoggableKind, string> = { flights: "flights", hotel_ideas: "accommodation" };

/** The category a flight or stay belongs under (by its default name), or null if the owner renamed or removed it. */
export function categoryFor(kind: LoggableKind, categories: CategoryLike[]): string | null {
  return categories.find((c) => c.name.trim().toLowerCase() === CATEGORY_NAME[kind])?.id ?? null;
}

export function flightDescription(f: Pick<FlightLike, "from_code" | "to_code" | "airline" | "flight_no">): string {
  const route = `${f.from_code?.trim() || "?"} → ${f.to_code?.trim() || "?"}`;
  const flight = [f.airline, f.flight_no].filter(Boolean).join(" ").trim();
  return `Flight ${route}${flight ? ` (${flight})` : ""}`.slice(0, 120);
}

export function stayDescription(s: Pick<StayLike, "hotel" | "city">): string {
  return `Stay: ${s.hotel}${s.city ? ` · ${s.city}` : ""}`.slice(0, 120);
}

/** What the Log-as-expense form starts with. The amount is the fare or stay total, in the trip's home currency. */
export function expenseDefaults(
  kind: LoggableKind,
  item: FlightLike | StayLike,
  categories: CategoryLike[],
  today: string,
) {
  const isFlight = kind === "flights";
  const amount = isFlight ? (item as FlightLike).fare : (item as StayLike).total;
  return {
    description: isFlight ? flightDescription(item as FlightLike) : stayDescription(item as StayLike),
    amount: amount === null || amount === undefined ? "" : String(amount),
    category_id: categoryFor(kind, categories),
    spent_on: today,
  };
}

/** The key that ties an expense to its source (matches the expense's source_table + source_id). */
export const sourceKey = (table: string, id: string) => `${table}:${id}`;
