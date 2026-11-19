import type { Metadata } from "next";
import { Suspense } from "react";
import { Stays } from "@/components/plan/stays";
import { PageSkeleton } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";

export const metadata: Metadata = { title: "Stays" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ViewOnlyBanner />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Stays</h1>
        <Stays />
      </div>
    </Suspense>
  );
}
