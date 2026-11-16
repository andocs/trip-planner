"use client";

import { Itinerary } from "@/components/plan/itinerary";
import { ViewOnlyBanner } from "@/components/view-only-banner";

/** The day-by-day plan. Flights and Stays are their own screens; the map opens from the header when asked for. */
export function ItineraryScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <Itinerary />
    </>
  );
}
