"use client";

import { Loader2, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/format";
import { useClaimableTrips, useClaimTrip, useUser } from "@/lib/queries/trip";
import { GateLayout, gateTitle } from "./gate-layout";

/** One-time step for the owner: take ownership of a trip that was created before owners existed. */
export function ClaimTrip() {
  const user = useUser().data;
  const trips = useClaimableTrips(true).data ?? [];
  const claim = useClaimTrip();
  const trip = trips[0];
  if (!trip) return null;
  return (
    <GateLayout>
      <h1 className={gateTitle}>Claim this trip</h1>
      <p className="text-fg-muted">
        You&rsquo;re signed in as <b className="text-fg">{user?.email}</b>. This trip was created before owners existed.
      </p>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <span className="grid size-10 place-items-center rounded-full bg-ink text-ground" aria-hidden>
          <MapPinned className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-bold">{trip.name}</div>
          <div className="text-sm text-fg-muted">{formatDateRange(trip.start_date, trip.end_date)}</div>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>You become the owner and can edit everything.</li>
        <li>Everyone who has the link keeps view-only access.</li>
      </ul>
      <Button size="lg" className="w-full" disabled={claim.isPending} onClick={() => claim.mutate(trip.id)}>
        {claim.isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
        Claim this trip
      </Button>
    </GateLayout>
  );
}
