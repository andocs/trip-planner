"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import type { Tables } from "@/lib/database.types";
import { getCurrentUser, getSupabase, signInForInvite } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";

export type Trip = Tables<"trips">;

/** The signed-in user (null when signed out). Never creates a session. */
export function useUser() {
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void qc.invalidateQueries({ queryKey: qk.user });
        if (event === "SIGNED_OUT") qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.user[0] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  return useQuery({ queryKey: qk.user, queryFn: getCurrentUser, staleTime: Infinity });
}

export function useActiveTrip() {
  const user = useUser();
  return useQuery({
    queryKey: qk.activeTrip,
    enabled: !!user.data,
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await getSupabase().rpc("active_trip");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** True for the Google account listed in app_admins (the only account that can own trips). */
export function useIsAdmin() {
  const user = useUser();
  return useQuery({
    queryKey: qk.admin,
    enabled: !!user.data && !user.data.isAnonymous,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("is_admin");
      if (error) throw error;
      return data === true;
    },
  });
}

export type Role = "owner" | "editor" | "viewer";

export function useTripRole(tripId: string | undefined) {
  return useQuery({
    queryKey: qk.role(tripId ?? ""),
    enabled: !!tripId,
    queryFn: async (): Promise<Role | null> => {
      const { data, error } = await getSupabase().rpc("trip_role", { t: tripId! });
      if (error) throw error;
      return (data as Role | null) ?? null;
    },
  });
}

/** Trips from before owners existed; only the admin gets any. */
export function useClaimableTrips(enabled: boolean) {
  return useQuery({
    queryKey: qk.claimable,
    enabled,
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await getSupabase().rpc("claimable_trips");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClaimTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      const { error } = await getSupabase().rpc("claim_trip", { p_trip: tripId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("You now own this trip.");
    },
    onError: (e) => toast.error(`Couldn't claim the trip: ${errorMessage(e)}`),
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name?: string) => {
      const { data, error } = await getSupabase().rpc("create_trip", name ? { p_name: name } : {});
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.activeTrip }),
  });
}

/** Opens an invite link: signs in anonymously if needed, then joins as a viewer. */
export async function joinTrip(token: string): Promise<string> {
  await signInForInvite();
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
      const { data, error } = await getSupabase().rpc("regenerate_invite", { p_trip: tripId });
      if (error) throw error;
      return data;
    },
    onSuccess: (token) => {
      const prev = qc.getQueryData<Trip | null>(qk.activeTrip);
      if (prev) qc.setQueryData<Trip>(qk.activeTrip, { ...prev, join_token: token });
      toast.success("New invite link created. Everyone who joined with the old link is signed out of this trip.");
    },
    onError: (err) => toast.error(`Couldn't create a new link: ${errorMessage(err)}`),
  });
}
