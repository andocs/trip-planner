"use client";

import { Card } from "@/components/ui/card";
import { TripGate, useTrip } from "@/components/trip-gate";

function Body({ title, milestone }: { title: string; milestone: number }) {
  const trip = useTrip();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <p className="text-fg-muted">
          {trip.name}: this screen arrives in milestone {milestone}.
        </p>
      </Card>
    </div>
  );
}

export function PlaceholderScreen(props: { title: string; milestone: number }) {
  return (
    <TripGate>
      <Body {...props} />
    </TripGate>
  );
}
