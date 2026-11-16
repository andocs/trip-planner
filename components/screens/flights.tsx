"use client";

import { Flights } from "@/components/plan/flights";
import { ViewOnlyBanner } from "@/components/view-only-banner";

export function FlightsScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Flights</h1>
        <Flights />
      </div>
    </>
  );
}
