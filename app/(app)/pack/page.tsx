import type { Metadata } from "next";
import { Suspense } from "react";
import { PackScreen } from "@/components/screens/pack";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Pack" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PackScreen />
    </Suspense>
  );
}
