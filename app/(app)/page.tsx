import { Suspense } from "react";
import { HomeScreen } from "@/components/screens/home";
import { PageSkeleton } from "@/components/trip-gate";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeScreen />
    </Suspense>
  );
}
