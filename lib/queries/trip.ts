"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Tables } from "@/lib/database.types";
import { ensureUser, getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";

export type Trip = Tables<"trips">;

export function useUserId() {
  return useQuery({ queryKey: qk.user, queryFn: ensureUser, staleTime: Infinity, retry: 2 });
}

export function useActiveTrip() {
  const user = useUserId();
  return useQuery({
    queryKey: qk.activeTrip,
    enabled: user.isSuccess,
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await getSupabase().rpc("active_trip");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name?: string) => {
      await ensureUser();
      const { data, error } = await getSupabase().rpc("create_trip", name ? { p_name: name } : {});
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.activeTrip }),
  });
}

export async function joinTrip(token: string): Promise<string> {
  await ensureUser();
  const { data, error } = await getSupabase().rpc("join_trip", { p_token: token });
  if (error) throw error;
  return data;
}

export type TripPatch = Partial<
  Pick<
    Trip,
    | "name"
    | "destination"
    | "start_date"
    | "end_date"
    | "home_currency"
    | "foreign_currency"
    | "rate"
    | "rate_date"
    | "budget"
    | "map_region"
  >
>;

/** Optimistically patches the active trip; rolls back with a toast on failure. */
export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TripPatch }) => {
      const { error } = await getSupabase().from("trips").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ patch }) => {
      await qc.cancelQueries({ queryKey: qk.activeTrip });
      const prev = qc.getQueryData<Trip | null>(qk.activeTrip);
      if (prev) qc.setQueryData<Trip>(qk.activeTrip, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(qk.activeTrip, ctx?.prev);
      toast.error(`Couldn't save trip settings: ${errorMessage(err)}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.activeTrip }),
  });
}

export function useRegenerateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      const { data, error } = await getSupabase().rpc("regenerate_join_token", { p_trip: tripId });
      if (error) throw error;
      return data;
    },
    onSuccess: (token) => {
      const prev = qc.getQueryData<Trip | null>(qk.activeTrip);
      if (prev) qc.setQueryData<Trip>(qk.activeTrip, { ...prev, join_token: token });
      toast.success("New invite link created. The old link no longer works.");
    },
    onError: (err) => toast.error(`Couldn't create a new link: ${errorMessage(err)}`),
  });
}
