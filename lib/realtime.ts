"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Trip } from "@/lib/queries/trip";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "./queries/keys";
import { fetchPeople, peopleKey } from "./queries/ideas";
import { fetchRows, pendingDeleteIds, type ChildTable } from "./queries/table";
import { applyChange, type Change } from "./realtime-apply";

const CHILD_TABLES: ChildTable[] = [
  "travelers",
  "destinations",
  "categories",
  "expenses",
  "itinerary_items",
  "flights",
  "transfers",
  "hotel_ideas",
  "food_places",
  "menu_items",
  "attractions",
  "packing_items",
  "gifts",
  "reminders",
  "votes",
  "comments",
  "place_refs",
  "item_images",
  "flight_refs",
];

/**
 * Once the app is idle after opening, load every screen's tables in the background (about a dozen
 * small reads, in parallel). Realtime keeps them current, so the first visit to any tab is instant
 * instead of a skeleton plus a round trip. Skips tables that are already fresh (e.g. the cold-load prefetch).
 */
export function useWarmCache(tripId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const warm = () => {
      for (const table of CHILD_TABLES) {
        void qc.prefetchQuery({ queryKey: qk.table(table, tripId), queryFn: () => fetchRows(table, tripId) });
      }
      void qc.prefetchQuery({ queryKey: peopleKey(tripId), queryFn: () => fetchPeople(tripId) });
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1500);
    return () => clearTimeout(id);
  }, [tripId, qc]);
}

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
