import type { Metadata } from "next";
import { Suspense } from "react";
import { StaysScreen } from "@/components/screens/stays";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Stays" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaysScreen />
    </Suspense>
  );
}
