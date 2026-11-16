"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { endPosition, groupDays, dateForDay, type Item, type Update } from "@/lib/itinerary";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Row } from "./table";

type ItineraryRow = Row<"itinerary_items">;

/**
 * Save a drag. Usually one row changes (the moved item gets a position between its new neighbours); when a day had to
 * be numbered again, a few more do. The screen updates at once and rolls back with a message if the save fails.
 */
export function useMoveItems() {
  const trip = useTrip();
  const qc = useQueryClient();
  const key = qk.table("itinerary_items", trip.id);
  return useMutation({
    mutationFn: async (updates: Update[]) => {
      const db = getSupabase();
      const results = await Promise.all(
        updates.map((u) =>
          db.from("itinerary_items").update({ day: u.day, position: u.position, on_date: u.on_date }).eq("id", u.id).eq("trip_id", trip.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ItineraryRow[]>(key);
      qc.setQueryData<ItineraryRow[]>(key, (old) =>
        old?.map((r) => {
          const u = updates.find((x) => x.id === r.id);
          return u ? { ...r, day: u.day, position: u.position, on_date: u.on_date } : r;
        }),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(`Couldn't move it: ${errorMessage(err)}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Where a new item goes: the end of its day, and the date that day falls on (never typed). */
export function placeAtEndOfDay(items: Item[], day: number | null, start: string | null | undefined) {
  const dayItems = groupDays(items, start, null).find((g) => g.day === day)?.items ?? [];
  return { day, on_date: dateForDay(start, day), position: endPosition(dayItems) };
}
