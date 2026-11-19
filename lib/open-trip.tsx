"use client";

import { createContext, useContext, type ReactNode } from "react";
import { withTrip } from "@/lib/trip-path";

/**
 * Which trip the screen was asked to open: an id from the address (/t/<id>/...), or null for "the trip I joined last" (the
 * older bare addresses). The gate, the trip queries and the server prefetch all read it, so two tabs can show two trips without
 * sharing one cache entry. Never trusted for access: the database checks membership of whatever id arrives.
 */
const OpenTripContext = createContext<string | null>(null);

export function OpenTripProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  return <OpenTripContext.Provider value={tripId}>{children}</OpenTripContext.Provider>;
}

/** The trip id the page asked for, or null for the default (the trip joined last). */
export function useRequestedTripId(): string | null {
  return useContext(OpenTripContext);
}

/** Turns a bare link ("/itinerary") into one inside the open trip when the page is showing a trip by id. */
export function useTripHref(): (href: string) => string {
  const id = useRequestedTripId();
  return (href) => withTrip(id, href);
}
