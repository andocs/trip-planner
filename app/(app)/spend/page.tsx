import type { Metadata } from "next";
import { Suspense } from "react";
import { SpendScreen } from "@/components/screens/spend";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Spend" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SpendScreen />
    </Suspense>
  );
}
