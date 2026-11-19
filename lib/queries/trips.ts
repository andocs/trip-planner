"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { useUser } from "./trip";

/** One row of my_trips() (migration 34): a trip I am on, with my role. */
export type TripListItem = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  archived_at: string | null;
  role: string;
  joined_at: string;
};

/** Every trip the signed-in person is on (live, setting up, archived). */
export function useMyTrips() {
  const user = useUser();
  return useQuery({
    queryKey: qk.myTrips,
    enabled: !!user.data,
    staleTime: 30_000,
    queryFn: async (): Promise<TripListItem[]> => {
      const { data, error } = await getSupabase().rpc("my_trips");
      if (error) throw error;
      return (data ?? []) as TripListItem[];
    },
  });
}

/** Adds a trip and archives nothing; the new trip starts as a draft the setup wizard fills in. Resolves to its id. */
export function useNewTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, copyFrom }: { name: string; copyFrom?: string }): Promise<string> => {
      const { data, error } = await getSupabase().rpc("new_trip", { p_name: name, ...(copyFrom ? { p_copy_from: copyFrom } : {}) });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myTrips }),
    onError: (e) => toast.error(`Couldn't add the trip: ${errorMessage(e)}`),
  });
}

/** Archives or restores a trip (owner only). */
export function useArchiveTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, restore }: { tripId: string; restore: boolean }) => {
      const { error } = await getSupabase().rpc(restore ? "restore_trip" : "archive_trip", { p_trip: tripId });
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      await Promise.all([qc.invalidateQueries({ queryKey: qk.myTrips }), qc.invalidateQueries({ queryKey: qk.activeTrip })]);
      toast.success(v.restore ? "Trip restored." : "Trip archived.");
    },
    onError: (e) => toast.error(`Couldn't change the trip: ${errorMessage(e)}`),
  });
}
