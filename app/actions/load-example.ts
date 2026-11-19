"use server";

import seed from "@/seed/vietnam26.seed.json";
import { applySeedPlan, planForTrip, tripIsEmpty } from "@/lib/seed-apply";
import { createSupabaseServer } from "@/lib/supabase/server";

export type LoadExampleResult = { ok: true; notes: string[] } | { ok: false; error: string };

/**
 * Loads the Vietnam '26 example into the named trip (which the caller must own), or, with no trip id, into the caller's most
 * recent trip (creating one if needed).
 * Runs with the caller's own session, so Row Level Security still applies.
 * Refuses if the trip already has data.
 */
export async function loadExample(tripIdArg?: string): Promise<LoadExampleResult> {
  try {
    const supabase = await createSupabaseServer();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims.sub) return { ok: false, error: "Not signed in. Reload the page and try again." };

    let tripId: string | undefined = tripIdArg;
    if (tripId) {
      const { data: owns, error: ownErr } = await supabase.rpc("is_trip_owner", { t: tripId });
      if (ownErr) throw ownErr;
      if (owns !== true) return { ok: false, error: "Only the trip owner can load the example." };
    } else {
      const { data: active, error: activeErr } = await supabase.rpc("active_trip");
      if (activeErr) throw activeErr;
      tripId = active?.[0]?.id;
    }
    if (!tripId) {
      const { data: created, error } = await supabase.rpc("create_trip", { p_name: "Vietnam '26" });
      if (error) throw error;
      tripId = created;
    }

    if (!(await tripIsEmpty(supabase, tripId))) {
      return { ok: false, error: "This trip already has data. The example only loads into an empty trip." };
    }
    const plan = await planForTrip(supabase, tripId, seed);
    await applySeedPlan(supabase, tripId, plan);
    return { ok: true, notes: plan.notes };
  } catch (err) {
    // The details can name tables or policies; they stay on the server.
    console.error("load-example failed", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "Couldn't load the example. Try again in a moment." };
  }
}
