"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRole, useTrip } from "@/components/trip-gate";
import { qk } from "@/lib/queries/keys";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export type Guest = { user_id: string; label: string | null; email: string | null; joined_at: string };

/**
 * The people who joined with the invite link (owner only; nobody else can read the member list). A guest with an email
 * has connected Google; one without is still a guest on one browser. Keyed by user id, to match `travelers.user_id`.
 */
export function useGuests() {
  const trip = useTrip();
  const owner = useRole() === "owner";
  const query = useQuery({
    queryKey: qk.members(trip.id),
    enabled: owner,
    queryFn: async (): Promise<Guest[]> => {
      const { data, error } = await getSupabase()
        .from("trip_members")
        .select("user_id, label, email, joined_at")
        .eq("trip_id", trip.id)
        .eq("role", "viewer")
        .is("revoked_at", null)
        .order("joined_at");
      if (error) throw error;
      return data;
    },
  });
  const byUser = new Map((query.data ?? []).map((g) => [g.user_id, g]));
  return { owner, byUser, loaded: query.isSuccess };
}

/** Takes a guest's access away (they can come back only with a newly made invite link). Their traveler row stays. */
export function useRemoveGuestAccess() {
  const trip = useTrip();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await getSupabase().rpc("revoke_viewer", { p_trip: trip.id, p_user: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.members(trip.id) });
      toast.success("Their access was removed.");
    },
    onError: (e) => toast.error(`Couldn't remove their access: ${errorMessage(e)}`),
  });
}
