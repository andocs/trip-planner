import type { Page, Route, WebSocketRoute } from "@playwright/test";
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
    if (path === "/rest/v1/rpc/join_trip") {
      const { p_token } = req.postDataJSON() as { p_token: string };
      if (p_token !== trip.join_token)
        return json(
          { code: "P0002", message: "Invite link is invalid or has expired", details: null, hint: null },
          400,
        );
      return json(trip.id);
    }
    if (path === "/rest/v1/rpc/start_new_trip") {
      const { p_copy_setup } = req.postDataJSON() as { p_copy_setup: boolean };
      const travelers = p_copy_setup ? (tables.get("travelers") ?? []) : [];
      const newId = `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`;
      trip = {
        ...trip,
        id: newId,
        name: "My Trip",
        destination: null,
        start_date: null,
        end_date: null,
        budget: 0,
        ...(p_copy_setup ? {} : { home_currency: "PHP", foreign_currency: "USD", rate: 1 }),
      };
      tables.clear();
      tables.set(
        "travelers",
        travelers.map((t) => ({ ...t, id: `${t.id}-new`, trip_id: newId })),
      );
      tables.set(
        "categories",
        defaults.map((name, i) => ({ id: `n${i}`, trip_id: newId, name, planned: null, sort: i, created_at: now })),
      );
      return json(newId);
    }

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

  // --- Realtime: a minimal Phoenix-channel server (JSON array frames, protocol 2.0.0) ---
  type Binding = { id: number; event: string; table: string; filter?: string };
  let socket: WebSocketRoute | undefined;
  let channel: { topic: string; bindings: Binding[] } | undefined;

  function onSocket(ws: WebSocketRoute) {
    socket = ws;
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw)) as [
        string | null,
        string,
        string,
        string,
        { config?: { postgres_changes?: Omit<Binding, "id">[] } },
      ];
      const reply = (response: object) =>
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "phx_join") {
        const bindings = (payload.config?.postgres_changes ?? []).map((b, i) => ({ ...b, id: 1000 + i }));
        channel = { topic, bindings };
        reply({ postgres_changes: bindings });
      } else reply({}); // heartbeat, access_token, phx_leave
    });
  }

  /** Simulates another phone changing a row: updates the store and pushes the change over the socket. */
  function remoteChange(table: string, type: "INSERT" | "UPDATE" | "DELETE", record: Row) {
    const rows = tables.get(table) ?? [];
    if (type === "INSERT") tables.set(table, [...rows, record]);
    if (type === "UPDATE")
      tables.set(
        table,
        rows.map((r) => (r.id === record.id ? { ...r, ...record } : r)),
      );
    if (type === "DELETE")
      tables.set(
        table,
        rows.filter((r) => r.id !== record.id),
      );
    if (!socket || !channel) throw new Error("realtime channel not joined yet");
    const ids = channel.bindings.filter((b) => b.table === table && b.event === type).map((b) => b.id);
    const full = type === "DELETE" ? null : (tables.get(table) ?? []).find((r) => r.id === record.id);
    socket.send(
      JSON.stringify([
        null,
        null,
        channel.topic,
        "postgres_changes",
        {
          ids,
          data: {
            schema: "public",
            table,
            commit_timestamp: new Date().toISOString(),
            type,
            columns: [],
            record: full,
            old_record: type === "INSERT" ? null : { id: record.id },
            errors: null,
          },
        },
      ]),
    );
  }

  return {
    tables,
    remoteChange,
    get realtimeJoined() {
      return !!channel;
    },
    get trip() {
      return trip;
    },
    install: async (page: Page) => {
      await page.route(`${FAKE_URL}/**`, handle);
      await page.routeWebSocket(/fake\.supabase\.test\/realtime/, onSocket);
    },
  };
}
