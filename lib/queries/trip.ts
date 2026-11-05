"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/lib/database.types";
import { ensureUser, getSupabase } from "@/lib/supabase/client";
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
