import type { Metadata } from "next";
import { Suspense } from "react";
import { FlightsScreen } from "@/components/screens/flights";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Flights" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FlightsScreen />
    </Suspense>
  );
}
