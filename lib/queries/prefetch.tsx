import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { TripGate } from "@/components/trip-gate";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchBootstrap, type Bootstrap } from "./bootstrap";
import { qk } from "./keys";
import type { ChildTable } from "./table";

/** The tables each screen reads on first render. */
export const SCREEN_TABLES = {
  home: [
    "expenses",
    "categories",
    "travelers",
    "destinations",
    "packing_items",
    "itinerary_items",
    "flights",
    "gifts",
    "reminders",
    "hotel_ideas",
    "food_places",
    "attractions",
  ],
  spend: ["expenses", "categories", "travelers", "flights", "hotel_ideas"],
  itinerary: ["itinerary_items", "hotel_ideas", "destinations"],
  flights: ["flights", "transfers", "hotel_ideas", "expenses", "categories"],
  stays: ["hotel_ideas", "flights", "expenses", "categories"],
  places:["food_places", "menu_items", "attractions", "hotel_ideas", "votes", "comments"],
  pack: ["packing_items", "travelers", "gifts", "reminders"],
  settings: ["travelers", "destinations", "categories"],
} satisfies Record<string, ChildTable[]>;

/** Which screen a pathname is, so a cold load can prefetch just that screen's tables. */
export function screenTables(pathname: string | null): ChildTable[] {
  const seg = (pathname ?? "/").split("/")[1] ?? "";
  if (seg === "") return SCREEN_TABLES.home;
  return (SCREEN_TABLES as Record<string, ChildTable[]>)[seg] ?? [];
}

/**
 * Server-side prefetch for a COLD load only (a full page load, e.g. opening the app or pressing
 * reload). It runs in the (app) layout, which Next does not re-render on client navigations, so
 * moving between tabs never waits on it: the browser's TanStack cache and realtime serve those.
 *
 * Cost: one RPC (trip_bootstrap) then one parallel batch of table reads. There is no separate
 * getClaims(): the RPC itself runs under the caller's JWT, so Postgres/PostgREST validates it (a bad
 * token is a 401, and we simply fall back to the client fetch). proxy.ts already refreshed the cookie.
 */
async function prefetch(pathname: string | null): Promise<{ state: ReturnType<typeof dehydrate>; boot: Bootstrap } | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    // TanStack's dehydrate() reads Date.now(), which Cache Components forbids while prerendering.
    // This data is per-user and request-time anyway, so make that explicit before touching the clock.
    await connection();
    const supabase = await createSupabaseServer();
    const b = await fetchBootstrap(supabase);
    if (!b) return null;

    const qc = new QueryClient();
    qc.setQueryData(qk.user, b.user);
    qc.setQueryData(qk.activeTrip, b.trip);
    if (!b.user.isAnonymous) qc.setQueryData(qk.admin, b.isAdmin);
    if (b.trip) {
      qc.setQueryData(qk.role(b.trip.id), b.role);
      const db = supabase as unknown as SupabaseClient;
      const tripId = b.trip.id;
      await Promise.all(
        screenTables(pathname).map(async (t) => {
          const { data } = await db.from(t).select("*").eq("trip_id", tripId).order("created_at");
          if (data) qc.setQueryData(qk.table(t, tripId), data);
        }),
      );
    }
    return { state: dehydrate(qc), boot: b };
  } catch {
    return null;
  }
}

/**
 * The access gate, fed by the cold-load prefetch: hydrates the browser cache with the trip + this
 * screen's tables, so the first HTML already contains the content. If the prefetch can't run
 * (signed out, Supabase down), the gate falls back to loading on the client.
 */
export async function PrefetchedTripGate({ children }: { children: ReactNode }) {
  // Set by proxy.ts from the real request path (any client-sent value is overwritten there).
  const pathname = (await headers()).get("x-pathname");
  const result = await prefetch(pathname);
  if (!result) return <TripGate>{children}</TripGate>;
  return (
    <HydrationBoundary state={result.state}>
      {/* `boot` is the server's own answer, so the first client render can match the server HTML exactly. */}
      <TripGate prefetched boot={result.boot}>
        {children}
      </TripGate>
    </HydrationBoundary>
  );
}
