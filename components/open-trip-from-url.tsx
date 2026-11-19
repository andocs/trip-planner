"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { OpenTripProvider } from "@/lib/open-trip";
import { tripIdFromPath, withTrip } from "@/lib/trip-path";

/** Bare screen addresses (with an optional query or hash): the only links the guard below rewrites. */
const BARE_SCREEN = /^\/(?:itinerary|places|stays|flights|spend|pack|settings)?(?:[?#].*)?$/;

/**
 * Reads the trip id from the address and offers it to everything below. While a trip is open by id, a click on an in-app link
 * to a bare screen ("/pack?tab=gifts", from a card or reminder) stays inside that trip instead of jumping to the trip joined
 * last. Links that must leave the trip carry data-bare-trip. (Opening such a link in a new tab, or with a modifier key, is left
 * to the browser and lands on the trip joined last.)
 */
export function OpenTripFromUrl({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tripId = tripIdFromPath(pathname);

  useEffect(() => {
    if (!tripId) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-bare-trip")) return;
      const href = a.getAttribute("href") ?? "";
      if (!BARE_SCREEN.test(href)) return;
      e.preventDefault();
      router.push(withTrip(tripId, href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [tripId, router]);

  return <OpenTripProvider tripId={tripId}>{children}</OpenTripProvider>;
}
