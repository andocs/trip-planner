import type { Metadata } from "next";
import { Suspense } from "react";
import { PackScreen } from "@/components/screens/pack";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export const metadata: Metadata = { title: "Pack" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.pack}>
        <PackScreen />
      </Prefetch>
    </Suspense>
  );
}
