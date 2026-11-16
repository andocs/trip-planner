"use client";

import { ArrowUpRight } from "lucide-react";
import { MapView, type MapStop } from "@/components/map/map-view";
import { Card } from "@/components/ui/card";

/** Google Maps directions through the stops in the order of the itinerary. Opens in the browser: no API call, no quota. */
export function directionsUrl(stops: MapStop[]): string | null {
  if (stops.length < 2) return null;
  return `https://www.google.com/maps/dir/${stops.map((s) => `${s.lat},${s.lng}`).join("/")}`;
}

/**
 * The route beside the itinerary: the stops that have a map position, numbered as in the list, joined in the order you
 * travel with an arrow on each leg. Lines are straight; the link opens the real road route in Google Maps.
 */
export function ItineraryRoute({ stops, missing }: { stops: MapStop[]; missing: number }) {
  const url = directionsUrl(stops);
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="relative h-[260px] overflow-hidden rounded-2xl bg-(--sea)">
          <MapView
            stops={stops}
            arrows
            interactive={false}
            label="Route through the stops"
            insets={{ top: 40, right: 40, bottom: 40, left: 40 }}
          />
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          Numbered as in the list, in the order you travel. Lines are straight; the link below gives the road route.
        </p>
      </Card>
      {missing > 0 && (
        <p className="text-[13px] text-fg-muted">
          {missing} {missing === 1 ? "stop has" : "stops have"} no map position yet. Add one from its place on the board.
        </p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-bold text-teal shadow-[inset_0_0_0_1.5px_var(--line)]"
        >
          Open directions in Google Maps
          <ArrowUpRight className="size-4" strokeWidth={2.6} aria-hidden />
        </a>
      )}
    </div>
  );
}
