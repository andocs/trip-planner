import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CaptureHost } from "@/components/board/capture-host";
import { GoogleProfileSync } from "@/components/google-profile-sync";
import { OpenTripFromUrl } from "@/components/open-trip-from-url";
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
  // The outer Suspense is for /t/<trip id>/...: the trip id in the address is not known when the shell is prerendered, so
  // anything that reads the pathname there must sit inside a boundary. Bare screens (/itinerary, /) are unaffected.
  return (
    <Suspense fallback={<PageSkeleton />}>
    <OpenTripFromUrl>
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
    </OpenTripFromUrl>
    </Suspense>
  );
}
