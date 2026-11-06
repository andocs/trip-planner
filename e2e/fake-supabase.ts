import type { Page, Route, WebSocketRoute } from "@playwright/test";
import seed from "../seed/vietnam26.seed.json";
import { buildSeedPlan, INSERT_ORDER } from "../lib/seed-map";

/**
 * In-memory stand-in for Supabase Auth + PostgREST, wired up with page.route().
 * It lets the smoke test drive the real UI without a Supabase project. It implements
 * just the request shapes supabase-js sends: anonymous signup, rpc/active_trip,
 * select by trip_id, insert, update/delete by id.
 *
 * Roles: `role` picks who the browser is. "owner" is the Google admin, "viewer" joined by link,
 * "noaccess" is signed in with no trip, "signedout" has no session at all (the proxy shows Invite only).
 * Writes by a viewer are refused the way Postgres refuses them, so the UI's behaviour is exercised;
 * the real policies are proven in supabase/tests/rls_check.sql.
 */
export const FAKE_URL = "http://fake.supabase.test";

type Row = Record<string, unknown> & { id: string };
export type FakeRequest = { method: string; url: string; body?: unknown };
export type FakeResponse = { status: number; body?: unknown };

export type FakeRole = "owner" | "viewer" | "noaccess" | "signedout";

export function createFakeSupabase(
  opts: { withSeed?: boolean; role?: FakeRole; noTrip?: boolean; failSave?: boolean; draftStep?: number } = {},
) {
  let hasTrip = !opts.noTrip;
  let role: FakeRole = opts.role ?? "owner";
  const wizardSaves: { step: number; patch: Record<string, unknown> }[] = [];
  let finished: { starter: boolean } | null = null;
  const claimable: Row[] = [];
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
    owner_id: null,
    status: "active",
    onboarding_step: 1,
    invite_rotated_at: now,
  };
  tables.set(
    "categories",
    defaults.map((name, i) => ({ id: `c${i}`, trip_id: tripId, name, planned: null, sort: i, created_at: now })),
  );

  if (opts.draftStep) {
    trip = { ...trip, status: "draft", onboarding_step: opts.draftStep, name: "My Trip" };
    tables.set("destinations", [
      {
        id: "d1",
        trip_id: tripId,
        city: "Hanoi",
        country: "Vietnam",
        nights: 3,
        lat: 21.03,
        lng: 105.85,
        sort: 0,
        created_at: now,
      },
      {
        id: "d2",
        trip_id: tripId,
        city: "Sapa",
        country: "Vietnam",
        nights: 2,
        lat: 22.34,
        lng: 103.84,
        sort: 1,
        created_at: now,
      },
    ]);
    tables.set("travelers", [{ id: "t1", trip_id: tripId, name: "Jam", sort: 0, created_at: now }]);
  }

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
  const isOwner = () => role === "owner";
  const claims = () => ({
    sub: userId,
    role: "authenticated",
    exp,
    is_anonymous: !isOwner(),
    ...(isOwner() ? { email: "owner@test.local", app_metadata: { provider: "google", providers: ["google"] } } : {}),
  });
  const authUser = () => ({
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: !isOwner(),
    email: isOwner() ? "owner@test.local" : undefined,
    app_metadata: isOwner() ? { provider: "google", providers: ["google"] } : {},
    user_metadata: {},
    created_at: now,
  });
  const session = () => ({
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims())}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh",
    user: authUser(),
  });
  const canWrite = () => isOwner();

  /** Transport-independent request handler (used by Playwright routes and the local HTTP server). */
  function respond(req: FakeRequest): FakeResponse {
    const url = new URL(req.url);
    const path = url.pathname;
    const json = (body: unknown, status = 200): FakeResponse => ({ status, body });

    if (path.startsWith("/auth/v1/signup") || path.startsWith("/auth/v1/token")) return json(session());
    if (path.startsWith("/auth/v1/user")) return json(authUser());
    if (path.startsWith("/auth/v1/logout")) return { status: 204 };
    if (path === "/rest/v1/rpc/is_admin") return json(isOwner());
    if (path === "/rest/v1/rpc/trip_role")
      return json(role === "owner" ? "owner" : role === "viewer" ? "viewer" : null);
    if (path === "/rest/v1/rpc/claimable_trips") return json(isOwner() ? claimable : []);
    if (path === "/rest/v1/rpc/claim_trip") {
      claimable.length = 0;
      role = "owner";
      return { status: 204 };
    }
    if (path === "/rest/v1/rpc/regenerate_invite") return json("e2e-new-token");

    if (path === "/rest/v1/rpc/create_trip") {
      if (!canWrite())
        return json({ code: "42501", message: "Only the trip owner can create trips", details: null, hint: null }, 403);
      if (!hasTrip) {
        hasTrip = true;
        trip = {
          ...trip,
          status: "draft",
          onboarding_step: 1,
          name: "My Trip",
          start_date: null,
          end_date: null,
          destination: null,
          budget: 0,
        };
        tables.set("destinations", []);
        tables.set("travelers", []);
      }
      return json(trip.id);
    }
    if (path === "/rest/v1/rpc/save_onboarding") {
      if (!canWrite())
        return json(
          { code: "42501", message: "Only the trip owner can set up a trip", details: null, hint: null },
          403,
        );
      if (opts.failSave) return json({ code: "500", message: "boom", details: null, hint: null }, 500);
      const { p_step, p_patch } = req.body as { p_step: number; p_patch: Record<string, unknown> };
      const { stops, travelers, ...fields } = p_patch;
      trip = { ...trip, ...fields, onboarding_step: p_step };
      if (Array.isArray(stops))
        tables.set(
          "destinations",
          (stops as Record<string, unknown>[]).map((v, i) => ({
            id: `d${i}-${Date.now()}`,
            trip_id: trip.id,
            sort: i,
            created_at: now,
            ...v,
          })) as Row[],
        );
      if (Array.isArray(travelers))
        tables.set(
          "travelers",
          (travelers as string[]).map((name, i) => ({
            id: `t${i}-${Date.now()}`,
            trip_id: trip.id,
            name,
            sort: i,
            created_at: now,
          })),
        );
      wizardSaves.push({ step: p_step, patch: p_patch });
      return { status: 204 };
    }
    if (path === "/rest/v1/rpc/finish_onboarding") {
      if (!canWrite())
        return json(
          { code: "42501", message: "Only the trip owner can finish setting up a trip", details: null, hint: null },
          403,
        );
      const { p_starter } = req.body as { p_starter: boolean };
      trip = { ...trip, status: "active", onboarding_step: 6 };
      if (p_starter)
        tables.set("packing_items", [
          { id: "pk1", trip_id: trip.id, item: "Passport", category: "Documents", packed: false, created_at: now },
        ]);
      finished = { starter: p_starter };
      return { status: 204 };
    }
    if (path === "/rest/v1/rpc/active_trip")
      return json(!hasTrip || role === "noaccess" || role === "signedout" || claimable.length > 0 ? [] : [trip]);
    if (path === "/rest/v1/rpc/regenerate_join_token") return json("e2e-new-token");
    if (path === "/rest/v1/rpc/join_trip") {
      const { p_token } = req.body as { p_token: string };
      if (p_token !== trip.join_token)
        return json(
          { code: "P0002", message: "Invite link is invalid or has expired", details: null, hint: null },
          400,
        );
      if (role === "noaccess" || role === "signedout") role = "viewer"; // opening a link grants view access only
      return json(trip.id);
    }
    if (path === "/rest/v1/rpc/start_new_trip") {
      if (!canWrite())
        return json({ code: "42501", message: "Only the trip owner can start a trip", details: null, hint: null }, 403);
      const { p_copy_setup } = req.body as { p_copy_setup: boolean };
      const travelers = p_copy_setup ? (tables.get("travelers") ?? []) : [];
      const newId = `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`;
      trip = {
        ...trip,
        id: newId,
        status: "draft",
        onboarding_step: 1,
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
    const method = req.method;

    if (table === "trips" && method === "PATCH") {
      if (canWrite()) trip = { ...trip, ...(req.body as object) }; // a viewer's update matches zero rows
      return { status: 204 };
    }
    if (table === "trip_members") return json([]);
    const rows = tables.get(table) ?? [];
    if (method === "GET") return json(rows.filter((r) => !eq("trip_id") || r.trip_id === eq("trip_id")));
    if (method === "POST" && !canWrite())
      return json(
        {
          code: "42501",
          message: 'new row violates row-level security policy for table "' + table + '"',
          details: null,
          hint: null,
        },
        403,
      );
    if ((method === "PATCH" || method === "DELETE") && !canWrite()) return { status: 204 };
    if (method === "POST") {
      const body = req.body as Row | Row[];
      const added = (Array.isArray(body) ? body : [body]).map((r) => ({ created_at: new Date().toISOString(), ...r }));
      tables.set(table, [...rows, ...added]);
      return { status: 201 };
    }
    if (method === "PATCH") {
      const id = eq("id");
      tables.set(
        table,
        rows.map((r) => (r.id === id ? { ...r, ...(req.body as object) } : r)),
      );
      return { status: 204 };
    }
    if (method === "DELETE") {
      tables.set(
        table,
        rows.filter((r) => r.id !== eq("id")),
      );
      return { status: 204 };
    }
    return { status: 404 };
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
    respond,
    get role() {
      return role;
    },
    wizardSaves,
    get finished() {
      return finished;
    },
    claimable,
    install: async (page: Page) => {
      if (role !== "signedout") {
        // The session cookie supabase-js would have written after sign-in (name: sb-<project ref>-auth-token).
        const value = "base64-" + Buffer.from(JSON.stringify(session())).toString("base64url");
        await page.context().addCookies([{ name: "sb-fake-auth-token", value, url: "http://localhost:3210" }]);
      }
      await page.route(`${FAKE_URL}/**`, (route: Route) => {
        const req = route.request();
        let body: unknown;
        try {
          body = req.postDataJSON();
        } catch {
          body = undefined;
        }
        const res = respond({ method: req.method(), url: req.url(), body });
        return route.fulfill({
          status: res.status,
          contentType: "application/json",
          body: res.body === undefined ? "" : JSON.stringify(res.body),
        });
      });
      await page.routeWebSocket(/fake\.supabase\.test\/realtime/, onSocket);
    },
  };
}
