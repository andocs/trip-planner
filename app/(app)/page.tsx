import { Suspense } from "react";
import { HomeScreen } from "@/components/screens/home";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.home}>
        <HomeScreen />
      </Prefetch>
    </Suspense>
  );
}
