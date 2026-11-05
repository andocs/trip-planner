import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsScreen } from "@/components/screens/settings";
import { PageSkeleton } from "@/components/trip-gate";
import { Prefetch, SCREEN_TABLES } from "@/lib/queries/prefetch";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Prefetch tables={SCREEN_TABLES.settings}>
        <SettingsScreen />
      </Prefetch>
    </Suspense>
  );
}
