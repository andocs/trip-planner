import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CaptureHost } from "@/components/board/capture-host";
import { GoogleProfileSync } from "@/components/google-profile-sync";
import { MapHostLazy } from "@/components/map/map-host-lazy";
import { ServiceWorkerRegister } from "@/components/offline/sw-register";
import { PageSkeleton } from "@/components/trip-gate";
import { PrefetchedTripGate } from "@/lib/queries/prefetch";

/**
 * The gate lives here, once, so the trip context and the realtime subscription survive tab changes
 * (they used to be torn down and rebuilt inside every screen). The shell stays outside the Suspense so
 * the nav is in the first byte; cold-load data arrives through <PrefetchedTripGate>.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <MapHostLazy />
      <ServiceWorkerRegister />
      <Suspense fallback={<PageSkeleton />}>
        <PrefetchedTripGate>
          <CaptureHost />
          <GoogleProfileSync />
          {children}
        </PrefetchedTripGate>
      </Suspense>
    </AppShell>
  );
}
