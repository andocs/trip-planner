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
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

type Row = Record<string, unknown> & { id: string };
export type FakeRequest = { method: string; url: string; body?: unknown; size?: number };
export type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> };

export type FakeRole = "owner" | "viewer" | "noaccess" | "signedout";

export function createFakeSupabase(
  opts: { withSeed?: boolean; role?: FakeRole; noTrip?: boolean; failSave?: boolean; draftStep?: number; shareToken?: string } = {},
) {
  let hasTrip = !opts.noTrip;
  /** The read-only share token (migration 30); null when sharing is off. */
  let shareToken: string | null = opts.shareToken ?? null;
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
    timezone: "Asia/Manila",
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
  /** Display names: the browser's own (null until set) and anyone else who has voted or commented. */
  let myLabel: string | null = isOwner() ? "Jam" : null;
  const others = new Map<string, string | null>();
  /** Other trips the person is on (an owner of each): for the trip switcher and /t/<id> addresses. */
  const extraTrips: Row[] = [];
  const IDEA_TABLES = ["hotel_ideas", "food_places", "attractions"];
  /** Photo Storage (private bucket trip-photos): what was uploaded and removed, and a switch to refuse uploads. */
  const storage = {
    uploads: [] as { path: string; size: number }[],
    removed: [] as string[],
    used: 38 * 1024 * 1024,
    cap: 900 * 1024 * 1024,
    reject: false,
  };

  /** Transport-independent request handler (used by Playwright routes and the local HTTP server). */
  function respond(req: FakeRequest): FakeResponse {
    const url = new URL(req.url);
    const path = url.pathname;
    const json = (body: unknown, status = 200): FakeResponse => ({ status, body });

    if (path.startsWith("/auth/v1/signup") || path.startsWith("/auth/v1/token")) return json(session());
    if (path.startsWith("/auth/v1/user")) return json(authUser());
    if (path.startsWith("/auth/v1/logout")) return { status: 204 };
    if (path === "/rest/v1/rpc/trip_bootstrap") {
      // One call for what active_trip + is_admin + trip_role return separately (see the migration).
      const sub = (name: string, body?: unknown) =>
        respond({ method: "POST", url: `${url.origin}/rest/v1/rpc/${name}`, body }).body;
      const asked = (req.body as { p_trip?: string } | undefined)?.p_trip;
      const extra = asked ? extraTrips.find((x) => x.id === asked) : undefined;
      const last = (sub("active_trip") as Row[])[0] ?? null;
      const t = asked ? (asked === trip.id ? last : (extra ?? null)) : last;
      return json({
        user: { id: userId, email: isOwner() ? "owner@test.local" : null, is_anonymous: !isOwner() },
        trip: t,
        is_admin: isOwner(),
        role: t ? (extra && t.id === extra.id ? "owner" : sub("trip_role", { t: t.id })) : null,
      });
    }
    if (path === "/rest/v1/rpc/trip_people") {
      if (role === "noaccess" || role === "signedout") return json([]);
      return json([
        { user_id: userId, label: myLabel, role: role === "owner" ? "owner" : "viewer" },
        ...[...others].map(([id, label]) => ({ user_id: id, label, role: "viewer" })),
      ]);
    }
    if (path === "/rest/v1/rpc/set_my_label") {
      const { p_label } = req.body as { p_label: string };
      if (!p_label?.trim())
        return json({ code: "22023", message: "Name must be 1 to 40 characters", details: null, hint: null }, 400);
      myLabel = p_label.trim();
      return { status: 204 };
    }
    // Deletes place coordinates older than 30 days (a no-op here: the fake never ages rows).
    if (path === "/rest/v1/rpc/purge_stale_place_coords") return json(0);
    // The read-only share link (migration 30): the owner creates or stops it; anyone with the token reads a fixed slice.
    if (path === "/rest/v1/rpc/create_trip_share") {
      if (!isOwner()) return json({ code: "42501", message: "Only the trip owner can share the trip" }, 403);
      shareToken = "e2e" + Math.random().toString(16).slice(2).padEnd(33, "0").slice(0, 33);
      return json(shareToken);
    }
    if (path === "/rest/v1/rpc/revoke_trip_share") {
      if (!isOwner()) return json({ code: "42501", message: "Only the trip owner can stop sharing" }, 403);
      shareToken = null;
      return { status: 204 };
    }
    if (path === "/rest/v1/rpc/shared_trip") {
      const sent = (req.body as { p_token?: string } | undefined)?.p_token;
      if (!sent || !shareToken || sent !== shareToken) return json(null);
      const mine = (t: string) => (tables.get(t) ?? []).filter((r) => r.trip_id === tripId);
      const pick = (r: Row, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null]));
      return json({
        trip: pick(trip, ["name", "destination", "start_date", "end_date", "timezone"]),
        itinerary: mine("itinerary_items")
          .filter((i) => (i.kind ?? "stop") === "stop")
          .map((i) => pick(i, ["day", "on_date", "at_time", "duration_min", "activity", "city", "type", "tentative"])),
        flights: mine("flights").map((f) => pick(f, ["airline", "flight_no", "from_code", "to_code", "departs_at", "arrives_at", "dep_tz", "arr_tz", "terminal", "status"])),
        stays: mine("hotel_ideas").filter((x) => x.is_stay === true).map((x) => pick(x, ["hotel", "city", "check_in", "check_out"])),
      });
    }
    if (path === "/rest/v1/trip_shares") return json(isOwner() && shareToken ? [{ trip_id: tripId, token: shareToken }] : []);
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
    if (path === "/rest/v1/rpc/revoke_viewer") {
      const who = (req.body as { p_user?: string } | null)?.p_user;
      tables.set("trip_members", (tables.get("trip_members") ?? []).filter((m) => m.user_id !== who));
      return { status: 204 };
    }

    if (path === "/rest/v1/rpc/my_trips") {
      if (!hasTrip || role === "noaccess" || role === "signedout") return json([]);
      const item = (t: Row, r: string) => ({ id: t.id, name: t.name, destination: t.destination ?? null, start_date: t.start_date ?? null, end_date: t.end_date ?? null, status: t.status ?? "active", archived_at: t.archived_at ?? null, role: r, joined_at: "2026-06-01T00:00:00Z" });
      return json([item(trip, role === "owner" ? "owner" : String(role)), ...extraTrips.map((x) => item(x, "owner"))]);
    }
    if (path === "/rest/v1/rpc/new_trip") {
      if (!canWrite()) return json({ code: "42501", message: "Only the trip owner can create trips", details: null, hint: null }, 403);
      const { p_name } = req.body as { p_name?: string };
      const id = `00000000-0000-4000-8000-${String(extraTrips.length + 1).padStart(12, "0")}`;
      extraTrips.push({ ...trip, id, name: p_name || "My Trip", status: "draft", onboarding_step: 1, archived_at: null, start_date: null, end_date: null, destination: null });
      return json(id);
    }
    if (path === "/rest/v1/rpc/archive_trip" || path === "/rest/v1/rpc/restore_trip") {
      const { p_trip } = req.body as { p_trip: string };
      const restoring = path.endsWith("restore_trip");
      const row = extraTrips.find((x) => x.id === p_trip);
      if (row) Object.assign(row, { archived_at: restoring ? null : "2026-06-02T00:00:00Z", status: restoring ? "active" : "archived" });
      return { status: 204 };
    }
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

    if (path === "/rest/v1/rpc/photo_storage_status") {
      if (!isOwner()) return json({ code: "42501", message: "Not allowed", details: null, hint: null }, 403);
      return json([{ used: storage.used, cap: storage.cap }]);
    }
    if (path.startsWith("/storage/v1/")) {
      const bucket = "/storage/v1/object/";
      if (req.method === "POST" && path === `${bucket}sign/trip-photos`) {
        const paths = ((req.body as { paths?: string[] })?.paths ?? []) as string[];
        return json(paths.map((p) => ({ error: null, path: p, signedURL: `/object/sign/trip-photos/${p}?token=e2e` })));
      }
      if (req.method === "POST" && path.startsWith(`${bucket}trip-photos/`)) {
        if (!canWrite() || storage.reject)
          return json(
            { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" },
            403,
          );
        const name = decodeURIComponent(path.slice(`${bucket}trip-photos/`.length));
        storage.uploads.push({ path: name, size: req.size ?? 0 });
        storage.used += req.size ?? 0;
        return json({ Key: `trip-photos/${name}`, Id: "e2e" });
      }
      if (req.method === "DELETE" && path === `${bucket}trip-photos`) {
        const names = ((req.body as { prefixes?: string[] })?.prefixes ?? []) as string[];
        if (canWrite()) storage.removed.push(...names);
        return json(canWrite() ? names.map((name) => ({ name })) : []);
      }
      return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 404);
    }
    const table = path.replace("/rest/v1/", "");
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    const method = req.method;

    if (table === "trips" && method === "PATCH") {
      if (canWrite()) trip = { ...trip, ...(req.body as object) }; // a viewer's update matches zero rows
      return { status: 204 };
    }
    if (table === "trip_members") return json(tables.get("trip_members") ?? []);
    const rows = tables.get(table) ?? [];
    // Booking references are owner-only: a viewer gets no rows (row-level security), never an error.
    if (table === "flight_refs" && !isOwner())
      return json(
        method === "GET" ? [] : { code: "42501", message: "permission denied", details: null, hint: null },
        method === "GET" ? 200 : 403,
      );
    if (method === "GET") return json(rows.filter((r) => !eq("trip_id") || r.trip_id === eq("trip_id")));
    // select(..., { count: "exact", head: true }): the row count comes back in Content-Range.
    if (method === "HEAD") {
      const n = rows.filter((r) => !eq("trip_id") || r.trip_id === eq("trip_id")).length;
      // Cross-origin, so the page may only read this header if the response exposes it (as Supabase does).
      return { status: 200, headers: { "content-range": `*/${n}`, "access-control-expose-headers": "content-range" } };
    }
    if ((table === "votes" || table === "comments") && role !== "noaccess" && role !== "signedout") {
      if (method === "POST") {
        const body = (Array.isArray(req.body) ? req.body : [req.body]) as Row[];
        if (body.some((r) => r.user_id !== userId))
          return json(
            {
              code: "42501",
              message: 'new row violates row-level security policy for table "' + table + '"',
              details: null,
              hint: null,
            },
            403,
          );
        tables.set(table, [...rows, ...body.map((r) => ({ created_at: new Date().toISOString(), ...r }))]);
        return { status: 201 };
      }
      if (method === "PATCH" || method === "DELETE") {
        const id = eq("id");
        const mine = (r: Row) =>
          r.id === id && (r.user_id === userId || (method === "DELETE" && table === "comments" && isOwner()));
        tables.set(
          table,
          method === "DELETE"
            ? rows.filter((r) => !mine(r))
            : rows.map((r) => (mine(r) ? { ...r, ...(req.body as object) } : r)),
        );
        return { status: 204 };
      }
    }
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
      const added: Row[] = (Array.isArray(body) ? body : [body]).map((r) => ({
        created_at: new Date().toISOString(),
        ...(IDEA_TABLES.includes(table) ? { decision: "draft" } : {}),
        ...r,
      }));
      if (table === "itinerary_items")
        for (const r of added) {
          // _itinerary_source_guard: the database decides tentative from the source's decision
          const src = r.source_id
            ? (tables.get(String(r.source_table)) ?? []).find((x) => x.id === r.source_id)
            : undefined;
          r.tentative = !!src && src.decision === "draft";
        }
      tables.set(table, [...rows, ...added]);
      if (table === "flight_refs")
        tables.set(
          "flights",
          (tables.get("flights") ?? []).map((f) =>
            added.some((r) => r.flight_id === f.id) ? { ...f, has_ref: true } : f,
          ),
        );
      return { status: 201 };
    }
    if (method === "PATCH") {
      const id = eq("id");
      const patch = req.body as Row;
      tables.set(
        table,
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      if (IDEA_TABLES.includes(table) && typeof patch.decision === "string") {
        // _item_decision_changed: dropped removes the stop, otherwise it is solid only when confirmed
        const stops = tables.get("itinerary_items") ?? [];
        tables.set(
          "itinerary_items",
          patch.decision === "dropped"
            ? stops.filter((x) => !(x.source_table === table && x.source_id === id))
            : stops.map((x) =>
                x.source_table === table && x.source_id === id ? { ...x, tentative: patch.decision === "draft" } : x,
              ),
        );
      }
      return { status: 204 };
    }
    if (method === "DELETE") {
      const id = eq("id");
      tables.set(
        table,
        rows.filter((r) => r.id !== id),
      );
      if (IDEA_TABLES.includes(table))
        for (const t of ["itinerary_items", "votes", "comments", "place_refs", "item_images"])
          tables.set(
            t,
            (tables.get(t) ?? []).filter(
              (x) => !((x.source_table ?? x.item_table) === table && (x.source_id ?? x.item_id) === id),
            ),
          );
      // a flight's booking reference goes with it; an expense logged from a flight or stay keeps the money, loses the link
      if (table === "flights")
        tables.set(
          "flight_refs",
          (tables.get("flight_refs") ?? []).filter((x) => x.flight_id !== id),
        );
      if (table === "flights" || table === "hotel_ideas")
        tables.set(
          "expenses",
          (tables.get("expenses") ?? []).map((x) =>
            x.source_table === table && x.source_id === id ? { ...x, source_table: null, source_id: null } : x,
          ),
        );
      if (table === "flight_refs") {
        const gone = rows.find((r) => r.id === id);
        if (gone)
          tables.set(
            "flights",
            (tables.get("flights") ?? []).map((f) =>
              f.id === gone.flight_id ? { ...f, has_ref: false } : f,
            ),
          );
      }
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
    storage,
    extraTrips,
    /** Another person with a display name (so their votes and comments show a name). */
    addPerson: (id: string, label: string | null) => others.set(id, label),
    get myLabel() {
      return myLabel;
    },
    userId,
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
    /** The booked stays: the live hotel-idea rows that have is_stay set (a stay IS a booked hotel idea, migration 31). */
    stayRows: () => (tables.get("hotel_ideas") ?? []).filter((r) => r.is_stay === true),
    get shareToken() {
      return shareToken;
    },
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
        const res = respond({ method: req.method(), url: req.url(), body, size: req.postDataBuffer()?.length });
        return route.fulfill({
          status: res.status,
          headers: res.headers,
          contentType: "application/json",
          body: res.body === undefined ? "" : JSON.stringify(res.body),
        });
      });
      // The itinerary asks our own /api/weather. The real route would try to reach this fake Supabase from the server (it
      // cannot) and hang, so by default it answers with no weather; e2e/weather.spec.ts replaces this with real-looking days.
      await page.route("**/api/weather**", (route: Route) => route.fulfill({ json: { days: [] } }));
      // Photo links in the fixtures point at example.com. Serve a pixel so the tests never depend on the network:
      // an unreachable host fails at once on a CI runner, and the photo then falls back to its placeholder.
      await page.route("**://example.com/**", (route: Route) => route.fulfill({ body: PIXEL_PNG, contentType: "image/png" }));
      await page.routeWebSocket(/fake\.supabase\.test\/realtime/, onSocket);
    },
  };
}
