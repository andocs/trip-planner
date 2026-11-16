import type { Metadata } from "next";
import { Suspense } from "react";
import { ItineraryScreen } from "@/components/screens/itinerary";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Itinerary" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItineraryScreen />
    </Suspense>
  );
}
