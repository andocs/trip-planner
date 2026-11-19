"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

const key = (tripId: string) => ["share", tripId] as const;

/** The trip's share token, or null when sharing is off. Row-level security returns it to the owner only. */
export function useShareToken(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: key(tripId),
    enabled,
    queryFn: async () => {
      const db = getSupabase() as unknown as SupabaseClient;
      const { data, error } = await db.from("trip_shares").select("token").eq("trip_id", tripId).maybeSingle();
      if (error) throw error;
      return (data?.token as string | undefined) ?? null;
    },
  });
}

/** Switches sharing on, or replaces the link (the old one stops working). */
export function useCreateShare(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().rpc("create_trip_share", { p_trip: tripId });
      if (error) throw error;
      return data;
    },
    onSuccess: (token) => qc.setQueryData(key(tripId), token),
    onError: (e) => toast.error(`Couldn't create the link: ${errorMessage(e)}`),
  });
}

/** Switches sharing off: the link stops working at once. */
export function useStopShare(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().rpc("revoke_trip_share", { p_trip: tripId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData(key(tripId), null);
      toast.success("Sharing is off. The link no longer works.");
    },
    onError: (e) => toast.error(`Couldn't stop sharing: ${errorMessage(e)}`),
  });
}
