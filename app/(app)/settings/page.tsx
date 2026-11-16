import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsScreen } from "@/components/screens/settings";
import { PageSkeleton } from "@/components/trip-gate";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsScreen />
    </Suspense>
  );
}
