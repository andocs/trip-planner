import "server-only";

import type { z } from "zod";
import { requireUserId } from "@/lib/supabase/require-user";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { Sku } from "./fields";
import { PlacesError } from "./google";
import { PLACES_MESSAGES, type PlacesErrorCode } from "./types";

const STATUS: Record<PlacesErrorCode, number> = {
  not_configured: 503,
  cap: 429,
  rate: 429,
  unavailable: 502,
  bad_request: 400,
  forbidden: 403,
};

/** A fixed, generic error. Google's own error text, headers and URLs never get this far. */
export function fail(code: PlacesErrorCode) {
  return Response.json(
    { error: code, message: PLACES_MESSAGES[code] },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}

/** A small in-memory limiter for the free (Wikimedia) route: per signed-in owner, per server instance. */
const recent = new Map<string, number[]>();
function allow(userId: string, perMinute: number) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}

/**
 * The shared shape of every /api/places route:
 *   1. only the signed-in trip owner (is_admin) gets through;
 *   2. the body is validated with zod;
 *   3. a billable call first reserves one unit of its monthly cap in the database (fails closed);
 *   4. any failure becomes a fixed generic error.
 */
export async function placesRoute<S extends z.ZodType>(
  request: Request,
  schema: S,
  opts: { sku?: Sku; needsGoogleKey?: boolean; freePerMinute?: number },
  run: (body: z.infer<S>) => Promise<unknown>,
): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return fail("forbidden");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail("bad_request");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail("bad_request");

  if (opts.needsGoogleKey && !process.env.GOOGLE_MAPS_SERVER_KEY) return fail("not_configured");
  if (opts.freePerMinute && !allow(userId, opts.freePerMinute)) return fail("rate");

  if (opts.sku) {
    try {
      const supabase = await createSupabaseServer();
      const { data, error } = await supabase.rpc("reserve_api_call", { p_sku: opts.sku });
      if (error) return fail("not_configured"); // e.g. the migration is not applied yet: fail closed
      if (data === "cap") return fail("cap");
      if (data === "rate") return fail("rate");
      if (data !== "ok") return fail("unavailable");
    } catch {
      return fail("unavailable");
    }
  }

  try {
    const body = await run(parsed.data);
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof PlacesError ? e.code : "unavailable");
  }
}
