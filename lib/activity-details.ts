import { TABLE_OF_KIND, type Idea, type IdeaKind } from "./drafts";

/**
 * An activity on the itinerary takes the layout of its category: a sight, a food place or a stay. A hand-added activity
 * has no place on the board behind it, so the category's details (type, tickets, cuisine, hours ...) are kept with the
 * activity itself, in `details.place`, using the same shape the board uses. Sight is also the generic form (activities,
 * shopping, other). Pure.
 */

/** The category an activity's Type chip stands for. Anything that is not food or a stay uses the sight layout. */
export function kindOfType(type: string | null | undefined): IdeaKind {
  if (type === "Food & Drink") return "food";
  if (type === "Rest & Stay") return "stay";
  return "sight";
}

/** The category details saved on the activity itself, or null. */
export function placeOf(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const p = (details as Record<string, unknown>).place;
  return p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length > 0 ? (p as Record<string, unknown>) : null;
}

/** An activity's `details` with its category details replaced (null removes them). Other keys are kept as they were. */
export function withPlace(details: unknown, place: Record<string, unknown> | null): Record<string, unknown> {
  const base = details && typeof details === "object" && !Array.isArray(details) ? { ...(details as Record<string, unknown>) } : {};
  delete base.place;
  if (place && Object.keys(place).length > 0) base.place = place;
  return base;
}

/**
 * The place an activity reads as, for its card and its view: the board idea it came from (with the activity's own
 * category details laid over it when they were edited), or a stand-in made from the activity's own details.
 */
export function ideaForItem(item: { type: string | null; activity: string; city: string | null; note: string | null; details: unknown }, linked?: Idea): Idea | undefined {
  const place = placeOf(item.details);
  if (linked) return place ? { ...linked, details: place } : linked;
  if (!place) return undefined;
  const kind = kindOfType(item.type);
  return {
    table: TABLE_OF_KIND[kind],
    id: "activity",
    key: "activity:own",
    kind,
    name: item.activity,
    city: item.city,
    price: null,
    priceUnit: null,
    decision: "confirmed",
    note: item.note,
    nights: null,
    total: null,
    details: place,
    dealBreaker: false,
    created_at: "",
  };
}
