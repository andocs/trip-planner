import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanScreen } from "@/components/screens/plan";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.plan}>
        <PlanScreen />
      </Prefetch>
    </Suspense>
  );
}
