import type { Metadata } from "next";
import { Suspense } from "react";
import { Flights } from "@/components/plan/flights";
import { PageSkeleton } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";

export const metadata: Metadata = { title: "Flights" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ViewOnlyBanner />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Flights</h1>
        <Flights />
      </div>
    </Suspense>
  );
}
