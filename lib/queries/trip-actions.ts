"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadExample } from "@/app/actions/load-example";
import type { ExportData } from "@/lib/export";
import { ensureUser, getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Trip } from "./trip";

/** Loads the example via the server action, then refreshes everything. */
export function useLoadExample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureUser(); // the server action reads the session cookie
      const res = await loadExample();
      if (!res.ok) throw new Error(res.error);
      return res.notes;
    },
    onSuccess: async (notes) => {
      await qc.invalidateQueries();
      toast.success("Loaded the Vietnam ’26 example", { description: notes.join(" ") || undefined, duration: 8000 });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Archives the current trip and starts a fresh one; the whole group and the invite link move with it. */
export function useStartNewTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (copySetup: boolean) => {
      const { data, error } = await getSupabase().rpc("start_new_trip", { p_copy_setup: copySetup });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["trip"] });
      await qc.invalidateQueries({ queryKey: qk.activeTrip });
      toast.success("New trip started. The old one is archived; your invite link still works.");
    },
    onError: (e) => toast.error(`Couldn't start a new trip: ${errorMessage(e)}`),
  });
}

const EXPORT_TABLES = [
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
] as const;

/** Fetches every table fresh (not from cache) so the export matches the server. */
export async function fetchExportData(trip: Trip): Promise<ExportData> {
  const db = getSupabase() as unknown as SupabaseClient;
  const entries = await Promise.all(
    EXPORT_TABLES.map(async (t) => {
      const { data, error } = await db.from(t).select("*").eq("trip_id", trip.id).order("created_at");
      if (error) throw error;
      return [t, data] as const;
    }),
  );
  const tables = Object.fromEntries(entries) as Omit<ExportData, "trip">;
  tables.travelers.sort((a, b) => a.sort - b.sort);
  tables.destinations.sort((a, b) => a.sort - b.sort);
  tables.categories.sort((a, b) => a.sort - b.sort);
  return { trip, ...tables };
}
