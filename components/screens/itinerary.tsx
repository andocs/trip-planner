"use client";

import { Itinerary } from "@/components/plan/itinerary";
import { PlanRoute } from "@/components/plan/plan-route";
import { ViewOnlyBanner } from "@/components/view-only-banner";

/** The day-by-day plan, with the route beside it on desktop. Flights and Stays are their own screens now. */
export function ItineraryScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Itinerary</h1>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-4">
          <Itinerary />
          <PlanRoute />
        </div>
      </div>
    </>
  );
}
