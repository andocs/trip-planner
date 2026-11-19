"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { isStayRow, stayFromIdea, UNSTAY, validStatus, type IdeaRow, type Stay } from "@/lib/stays";
import { qk } from "./keys";
import { fetchRows, useRows, useUpdateRow } from "./table";

/**
 * The trip's booked stays. They are hotel ideas with `is_stay` set, so this reads the SAME cached query as the board's hotel
 * ideas (one fetch, one realtime stream) and picks the booked ones out. `sort` should be a stable function (module level).
 */
export function useStays(sort?: (a: Stay, b: Stay) => number) {
  const trip = useTrip();
  const select = useMemo(
    () => (rows: IdeaRow[]) => {
      const stays = rows.filter(isStayRow).map(stayFromIdea);
      return sort ? stays.sort(sort) : stays;
    },
    [sort],
  );
  return useQuery({
    queryKey: qk.table("hotel_ideas", trip.id),
    queryFn: () => fetchRows("hotel_ideas", trip.id),
    select,
  });
}

/** Change a stay's booking status (Planned, Booked, Done, Cancelled). */
export function useSetStayStatus() {
  const update = useUpdateRow("hotel_ideas", "stay");
  return (id: string, status: string) => update.mutate({ id, patch: { stay_status: validStatus(status) } });
}

/**
 * Take a stay off the Stays page. The idea stays on the Places board (it is the same row), only its booking facts are cleared,
 * with an Undo that puts them back. An expense logged from the stay keeps its link, so undoing, or booking it again, shows
 * it as logged again.
 */
export function useRemoveStay() {
  const update = useUpdateRow("hotel_ideas", "stay");
  const hotels = useRows("hotel_ideas");
  return (stay: Stay) => {
    const row = hotels.data?.find((r) => r.id === stay.id);
    if (!row) return;
    const before = { is_stay: true, check_in: row.check_in, check_out: row.check_out, stay_status: row.stay_status, confirmation: row.confirmation };
    update.mutate({ id: stay.id, patch: { ...UNSTAY } });
    toast(`Removed “${stay.hotel}” from Stays`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => update.mutate({ id: stay.id, patch: before }) },
    });
  };
}
