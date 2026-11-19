import type { Metadata } from "next";
import { Suspense } from "react";
import { Itinerary } from "@/components/plan/itinerary";
import { PageSkeleton } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";

export const metadata: Metadata = { title: "Itinerary" };

/** The day-by-day plan. Flights and Stays are their own screens; the map is the header's background. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ViewOnlyBanner />
      <Itinerary />
    </Suspense>
  );
}
