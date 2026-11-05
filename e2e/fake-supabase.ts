import type { Page, Route } from "@playwright/test";
import seed from "../seed/vietnam26.seed.json";
import { buildSeedPlan, INSERT_ORDER } from "../lib/seed-map";

/**
 * In-memory stand-in for Supabase Auth + PostgREST, wired up with page.route().
 * It lets the smoke test drive the real UI without a Supabase project. It implements
 * just the request shapes supabase-js sends: anonymous signup, rpc/active_trip,
 * select by trip_id, insert, update/delete by id. RLS is NOT simulated (see
 * supabase/tests/rls_check.sql for that).
 */
export const FAKE_URL = "http://fake.supabase.test";

type Row = Record<string, unknown> & { id: string };

export function createFakeSupabase(opts: { withSeed?: boolean } = {}) {
  const tripId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const now = new Date().toISOString();
  const tables = new Map<string, Row[]>();
  const defaults = [
    "Flights",
    "Accommodation",
    "Food & Drinks",
    "Transport",
    "Activities & Tickets",
    "Shopping & Pasalubong",
    "SIM & Misc",
    "Other",
  ];
  let trip: Row = {
    id: tripId,
    join_token: "e2e-token",
    name: "My Trip",
    destination: null,
    start_date: null,
    end_date: null,
    home_currency: "PHP",
    foreign_currency: "USD",
    rate: 1,
    rate_date: null,
    budget: 0,
    map_region: "world",
    archived_at: null,
    created_at: now,
  };
  tables.set(
    "categories",
    defaults.map((name, i) => ({ id: `c${i}`, trip_id: tripId, name, planned: null, sort: i, created_at: now })),
  );

  if (opts.withSeed) {
    const plan = buildSeedPlan(seed, tables.get("categories")! as { id: string; name: string }[]);
    trip = { ...trip, ...plan.trip };
    for (const u of plan.categoryUpdates) {
      const c = tables.get("categories")!.find((r) => r.id === u.id)!;
      Object.assign(c, { planned: u.planned, sort: u.sort });
    }
    INSERT_ORDER.forEach((t, ti) => {
      const rows = (plan.rows[t] as Row[]).map((r, i) => ({
        trip_id: tripId,
        created_at: new Date(Date.parse(now) + ti * 1000 + i).toISOString(),
        ...r,
      }));
      tables.set(t, [...(tables.get(t) ?? []), ...rows]);
    });
  }

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, role: "authenticated", exp, is_anonymous: true })}.sig`;

  async function handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.startsWith("/auth/v1/signup") || path.startsWith("/auth/v1/token")) {
      return json({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: exp,
        refresh_token: "refresh",
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
          app_metadata: {},
          user_metadata: {},
          created_at: now,
        },
      });
    }
    if (path.startsWith("/auth/v1/user"))
      return json({ id: userId, aud: "authenticated", role: "authenticated", is_anonymous: true });

    if (path === "/rest/v1/rpc/active_trip") return json([trip]);
    if (path === "/rest/v1/rpc/regenerate_join_token") return json("e2e-new-token");

    const table = path.replace("/rest/v1/", "");
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    const method = req.method();

    if (table === "trips" && method === "PATCH") {
      trip = { ...trip, ...(req.postDataJSON() as object) };
      return route.fulfill({ status: 204 });
    }
    const rows = tables.get(table) ?? [];
    if (method === "GET") return json(rows.filter((r) => !eq("trip_id") || r.trip_id === eq("trip_id")));
    if (method === "POST") {
      const body = req.postDataJSON() as Row | Row[];
      const added = (Array.isArray(body) ? body : [body]).map((r) => ({ created_at: new Date().toISOString(), ...r }));
      tables.set(table, [...rows, ...added]);
      return route.fulfill({ status: 201 });
    }
    if (method === "PATCH") {
      const id = eq("id");
      tables.set(
        table,
        rows.map((r) => (r.id === id ? { ...r, ...(req.postDataJSON() as object) } : r)),
      );
      return route.fulfill({ status: 204 });
    }
    if (method === "DELETE") {
      tables.set(
        table,
        rows.filter((r) => r.id !== eq("id")),
      );
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404 });
  }

  return {
    tables,
    get trip() {
      return trip;
    },
    install: (page: Page) => page.route(`${FAKE_URL}/**`, handle),
  };
}
