import type { Metadata } from "next";
import { Suspense } from "react";
import { PlacesScreen } from "@/components/screens/places";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export const metadata: Metadata = { title: "Places" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.places}>
        <PlacesScreen />
      </Prefetch>
    </Suspense>
  );
}
