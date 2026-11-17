"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyHint } from "@/components/ui/list";
import { qk } from "@/lib/queries/keys";
import { newId, useInsertRow, useRows } from "@/lib/queries/table";
import { nextSort } from "@/lib/use-sheet";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

type Member = { user_id: string; role: string; label: string | null; email: string | null; joined_at: string };

const joined = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Owner only: who can view this trip, with a remove button per viewer. */
export function ViewersSection() {
  const trip = useTrip();
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: qk.members(trip.id),
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await getSupabase()
        .from("trip_members")
        .select("user_id, role, label, email, joined_at")
        .eq("trip_id", trip.id)
        .eq("role", "viewer")
        .is("revoked_at", null)
        .order("joined_at");
      if (error) throw error;
      return data;
    },
  });
  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await getSupabase().rpc("revoke_viewer", { p_trip: trip.id, p_user: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.members(trip.id) });
      toast.success("Viewer removed.");
    },
    onError: (e) => toast.error(`Couldn't remove the viewer: ${errorMessage(e)}`),
  });
  const list = members.data ?? [];
  // A viewer who is also a traveler (someone who can share costs) is marked; the others get a button.
  const travelers = useRows("travelers").data ?? [];
  const addTraveler = useInsertRow("travelers", "traveler");
  const isTraveler = (userId: string) => travelers.some((t) => t.user_id === userId);
  const nameOf = (m: Member) => m.label?.trim() || m.email?.split("@")[0] || "Guest";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Viewers</CardTitle>
        <span className="text-sm text-fg-muted">{list.length === 1 ? "1 person" : `${list.length} people`}</span>
      </div>
      {list.length === 0 ? (
        <EmptyHint>Nobody has opened the invite link yet.</EmptyHint>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {list.map((m) => (
            <li key={m.user_id} className="flex min-h-14 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {m.label ?? m.email ?? `Viewer · joined ${joined(m.joined_at)}`}
                </span>
                <span className="block truncate text-sm text-fg-muted">{m.email ?? "Joined with the invite link"}</span>
              </span>
              {isTraveler(m.user_id) ? (
                <span className="inline-flex min-h-7 items-center rounded-full bg-teal-tint px-2.5 text-xs font-bold text-teal">Traveler</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Add ${nameOf(m)} as a traveler`}
                  onClick={() => addTraveler.mutate([{ id: newId(), name: nameOf(m), sort: nextSort(travelers), user_id: m.user_id }])}
                >
                  <UserPlus className="size-4" aria-hidden />
                  Add as traveler
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(m.user_id)}
                aria-label={`Remove ${m.label ?? m.email ?? "viewer"}`}
              >
                <UserX className="size-4" aria-hidden />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
