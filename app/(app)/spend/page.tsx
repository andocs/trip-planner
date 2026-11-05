import type { Metadata } from "next";
import { Suspense } from "react";
import { SpendScreen } from "@/components/screens/spend";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export const metadata: Metadata = { title: "Spend" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.spend}>
        <SpendScreen />
      </Prefetch>
    </Suspense>
  );
}
