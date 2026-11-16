import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanScreen } from "@/components/screens/plan";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanScreen />
    </Suspense>
  );
}
