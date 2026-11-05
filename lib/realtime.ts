"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Trip } from "@/lib/queries/trip";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "./queries/keys";
import { pendingDeleteIds, type ChildTable } from "./queries/table";
import { applyChange, type Change } from "./realtime-apply";

const CHILD_TABLES: ChildTable[] = [
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
];

type AnyRow = { id: string; trip_id?: string };

/**
 * Keeps every phone on the trip in sync. One channel per trip; RLS on the server
 * means we only ever receive rows from trips we belong to.
 */
export function useRealtimeSync(tripId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    let subscribedOnce = false;

    const apply = (table: ChildTable) => (payload: RealtimePostgresChangesPayload<AnyRow>) => {
      const change: Change<AnyRow> =
        payload.eventType === "DELETE"
          ? { eventType: "DELETE", old: payload.old }
          : { eventType: payload.eventType, new: payload.new };
      qc.setQueryData<AnyRow[]>(qk.table(table, tripId), (rows) =>
        applyChange(rows, change, { tripId, pendingDeletes: pendingDeleteIds }),
      );
    };

    let channel = supabase.channel(`trip:${tripId}`);
    for (const table of CHILD_TABLES) {
      channel = channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table, filter: `trip_id=eq.${tripId}` },
          apply(table),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table, filter: `trip_id=eq.${tripId}` },
          apply(table),
        )
        // DELETE events can't be filtered when RLS is on; unknown ids are ignored in applyChange.
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, apply(table));
    }
    channel = channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
      (payload: RealtimePostgresChangesPayload<Trip>) => {
        if (payload.eventType !== "UPDATE") return;
        if (payload.new.archived_at) {
          // Someone started a new trip: everyone moves to it.
          void qc.invalidateQueries({ queryKey: qk.activeTrip });
          return;
        }
        qc.setQueryData<Trip | null>(qk.activeTrip, (t) => (t && t.id === tripId ? { ...t, ...payload.new } : t));
      },
    );

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // After a reconnect we may have missed events: refetch this trip's data once.
      if (subscribedOnce) {
        void qc.invalidateQueries({ queryKey: ["trip", tripId] });
        void qc.invalidateQueries({ queryKey: qk.activeTrip });
      }
      subscribedOnce = true;
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, qc]);
}
