import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { qk } from "./keys";
import type { ChildTable } from "./table";

/**
 * Server-side prefetch for returning visitors. If the request carries a session cookie,
 * load the active trip and the tables this screen needs, and hand them to TanStack Query
 * so the first HTML already contains the content (no waiting for JS + round trips).
 * First-time visitors (no cookie) and any error fall back to the normal client fetch.
 */
async function prefetch(tables: ChildTable[]) {
  if (!isSupabaseConfigured()) return null;
  try {
    // TanStack's dehydrate() reads Date.now(), which Cache Components forbids while prerendering.
    // This data is per-user and request-time anyway, so make that explicit before touching the clock.
    await connection();
    const supabase = await createSupabaseServer();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return null;
    const isAnonymous = claims.claims.is_anonymous === true;

    const qc = new QueryClient();
    qc.setQueryData(qk.user, { id: userId, email: claims.claims.email ?? null, isAnonymous });
    const { data: trips, error } = await supabase.rpc("active_trip");
    if (error) return null;
    const trip = trips?.[0] ?? null;
    qc.setQueryData(qk.activeTrip, trip);
    if (!isAnonymous) {
      const { data: admin } = await supabase.rpc("is_admin");
      qc.setQueryData(qk.admin, admin === true);
    }
    if (trip) {
      const { data: role } = await supabase.rpc("trip_role", { t: trip.id });
      qc.setQueryData(qk.role(trip.id), role ?? null);
    }

    if (trip) {
      const db = supabase as unknown as SupabaseClient;
      await Promise.all(
        tables.map(async (t) => {
          const { data } = await db.from(t).select("*").eq("trip_id", trip.id).order("created_at");
          if (data) qc.setQueryData(qk.table(t, trip.id), data);
        }),
      );
    }
    return dehydrate(qc);
  } catch {
    return null;
  }
}

export async function Prefetch({ tables, children }: { tables: ChildTable[]; children: ReactNode }) {
  const state = await prefetch(tables);
  return state ? <HydrationBoundary state={state}>{children}</HydrationBoundary> : children;
}

/** The tables each screen reads on first render. */
export const SCREEN_TABLES = {
  home: [
    "expenses",
    "categories",
    "travelers",
    "destinations",
    "packing_items",
    "itinerary_items",
    "stays",
    "flights",
    "gifts",
  ],
  spend: ["expenses", "categories", "travelers"],
  plan: ["itinerary_items", "flights", "transfers", "stays", "hotel_ideas"],
  places: ["food_places", "menu_items", "attractions"],
  pack: ["packing_items", "travelers", "gifts", "reminders"],
  settings: ["travelers", "destinations", "categories"],
} satisfies Record<string, ChildTable[]>;
