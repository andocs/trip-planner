import type { Json, Tables, TablesUpdate } from "./database.types";

/**
 * A stay is a hotel idea that has been booked (`hotel_ideas.is_stay`, migration 31), not a row of its own. This is the shape
 * the Stays screen, the budget, the calendar file, the export and the reminders read: the SAME fields a stay row used to have,
 * built from the idea row, so nothing that reads a stay needed to learn about ideas. Pure: no React, no network.
 *
 * Where each field lives on the idea row:
 *   hotel, city, total    the idea's own columns        check_in, check_out, confirmation   the booking columns
 *   status                stay_status                   note                                `room` (for ideas, `room` has always held the notes)
 *   room                  details.rooms                 details                             the idea's details (stay keys are picked out when read)
 */
export type Stay = {
  id: string;
  trip_id: string;
  created_at: string;
  hotel: string;
  city: string | null;
  room: string | null;
  note: string | null;
  check_in: string | null;
  check_out: string | null;
  total: number | null;
  confirmation: string | null;
  status: string;
  details: Json;
};

export type IdeaRow = Tables<"hotel_ideas">;

export const STAY_STATUSES = ["Planned", "Booked", "Done", "Cancelled"] as const;
export const validStatus = (s: string | null | undefined) => ((STAY_STATUSES as readonly string[]).includes(s ?? "") ? (s as string) : "Planned");

export const isStayRow = (h: Pick<IdeaRow, "is_stay">): boolean => h.is_stay === true;

const asObject = (v: Json): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The stay a booked hotel idea stands for. */
export function stayFromIdea(h: IdeaRow): Stay {
  const rooms = asObject(h.details).rooms;
  return {
    id: h.id,
    trip_id: h.trip_id,
    created_at: h.created_at,
    hotel: h.hotel,
    city: h.city,
    room: typeof rooms === "string" && rooms.trim() ? rooms : null,
    note: h.room,
    check_in: h.check_in,
    check_out: h.check_out,
    total: h.total === null || h.total === undefined ? null : Number(h.total),
    confirmation: h.confirmation,
    status: h.stay_status,
    details: h.details,
  };
}

/** Every booked stay among the hotel idea rows. */
export const staysOf = (rows: IdeaRow[] | undefined): Stay[] => (rows ?? []).filter(isStayRow).map(stayFromIdea);

/** The columns that take a stay out of Stays (the idea stays on the board). */
export const UNSTAY = { is_stay: false, check_in: null, check_out: null, stay_status: "Planned", confirmation: null } as const satisfies TablesUpdate<"hotel_ideas">;
