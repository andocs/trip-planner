import type { Metadata } from "next";
import { Suspense } from "react";
import { PlacesScreen } from "@/components/screens/places";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Places" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlacesScreen />
    </Suspense>
  );
}
