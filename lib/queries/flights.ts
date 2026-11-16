"use client";

import { useRows, type Row } from "./table";

/**
 * Booking references live in their own table that only the owner can read (a viewer's query simply returns nothing).
 * Indexed by flight id.
 */
export function useFlightRefs() {
  const rows = useRows("flight_refs");
  const byFlight = new Map<string, Row<"flight_refs">>();
  for (const r of rows.data ?? []) byFlight.set(r.flight_id, r);
  return { byFlight, isPending: rows.isPending };
}
