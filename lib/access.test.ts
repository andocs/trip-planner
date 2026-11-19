import { describe, expect, it } from "vitest";
import { canEditAs, decideAccess, type Access, type AccessInput, type Answer } from "./access";
import type { AppUser, Bootstrap, Role, Trip } from "./queries/bootstrap";
import { OFFLINE_MESSAGE } from "./utils";

const trip = { id: "t1", name: "Vietnam", status: "active" } as Trip;
const me: AppUser = { id: "u1", email: "me@example.com", isAnonymous: false };
const guest: AppUser = { id: "u2", email: null, isAnonymous: true };

const ok = <T>(data: T): Answer<T> => ({ data, isError: false, isSuccess: true, isFetched: true, error: null });
const waiting = <T>(): Answer<T> => ({ data: undefined, isError: false, isSuccess: false, isFetched: false, error: null });
const failed = <T>(error: unknown, data?: T): Answer<T> => ({ data, isError: true, isSuccess: false, isFetched: true, error });

/** A signed-in owner whose live answers are all in, mounted, with no server snapshot. */
const base = (over: Partial<AccessInput> = {}): AccessInput => ({
  mounted: true,
  prefetched: false,
  user: ok<AppUser | null>(me),
  trip: ok<Trip | null>(trip),
  admin: ok(true),
  role: ok<Role | null>("owner"),
  ...over,
});
const boot = (over: Partial<Bootstrap> = {}): Bootstrap => ({ user: me, trip, isAdmin: true, role: "owner", ...over });
const kind = (a: Access) => a.kind;

describe("before the page has mounted", () => {
  it("with no server snapshot the first render is a skeleton, whatever the browser holds", () => {
    expect(decideAccess(base({ mounted: false, prefetched: false }))).toEqual({ kind: "loading" });
  });

  describe("with a server snapshot, only the snapshot decides", () => {
    const pre = (b: Bootstrap, over: Partial<AccessInput> = {}) => decideAccess(base({ mounted: false, prefetched: true, boot: b, ...over }));

    it("an owner who is an admin can edit", () => {
      expect(pre(boot())).toEqual({ kind: "ready", trip, role: "owner", canEdit: true });
    });
    it("an owner who is no longer an admin can look but not edit", () => {
      expect(pre(boot({ isAdmin: false }))).toMatchObject({ kind: "ready", role: "owner", canEdit: false });
    });
    it("an editor can edit; a viewer cannot", () => {
      expect(pre(boot({ role: "editor", isAdmin: false }))).toMatchObject({ role: "editor", canEdit: true });
      expect(pre(boot({ role: "viewer", isAdmin: false }))).toMatchObject({ role: "viewer", canEdit: false });
    });
    it("a signed-in person with no role on the trip has no access", () => {
      expect(pre(boot({ role: null }))).toEqual({ kind: "no-access", email: "me@example.com" });
    });
    it("no trip: the admin starts or claims one, anyone else has no access", () => {
      expect(pre(boot({ trip: null, role: null }))).toEqual({ kind: "no-trip", email: "me@example.com", isAdmin: true });
      expect(pre(boot({ trip: null, role: null, isAdmin: false, user: guest }))).toEqual({ kind: "no-access", email: null });
    });
    it("ignores what the browser's cache says, even if it disagrees (the cause of a hydration mismatch)", () => {
      const live = { user: ok<AppUser | null>(null), trip: ok<Trip | null>(null), role: ok<Role | null>(null) };
      expect(kind(pre(boot(), live))).toBe("ready");
      expect(kind(pre(boot(), { user: waiting(), trip: waiting(), role: waiting() }))).toBe("ready");
    });
  });
});

describe("once mounted, the live answers decide", () => {
  it("a snapshot no longer matters", () => {
    const a = decideAccess(base({ prefetched: true, boot: boot({ role: "viewer", isAdmin: false }), role: ok<Role | null>("owner") }));
    expect(a).toMatchObject({ kind: "ready", role: "owner", canEdit: true });
  });

  describe("the session", () => {
    it("waits for the user, shows the invite-only page for nobody, and an error with a retry", () => {
      expect(kind(decideAccess(base({ user: waiting() })))).toBe("loading");
      expect(kind(decideAccess(base({ user: ok<AppUser | null>(null) })))).toBe("signed-out");
      expect(decideAccess(base({ user: failed<AppUser | null>(new Error("boom")) }))).toEqual({ kind: "error", message: "boom", source: "user" });
    });
    it("keeps a user it already has when a refresh fails", () => {
      expect(kind(decideAccess(base({ user: failed<AppUser | null>(new Error("x"), me) })))).toBe("ready");
    });
  });

  describe("the trip", () => {
    it("waits for it, and an error shows a retry", () => {
      expect(kind(decideAccess(base({ trip: waiting() })))).toBe("loading");
      expect(decideAccess(base({ trip: failed<Trip | null>(new Error("nope")) }))).toEqual({ kind: "error", message: "nope", source: "trip" });
    });
    it("keeps a trip it already has when a refresh fails (a dropped connection must not blank a working screen)", () => {
      expect(kind(decideAccess(base({ trip: failed<Trip | null>(new Error("Failed to fetch"), trip) })))).toBe("ready");
    });
    it("a real person (not a guest) waits for the admin answer before deciding", () => {
      expect(kind(decideAccess(base({ admin: waiting() })))).toBe("loading");
      expect(kind(decideAccess(base({ user: ok<AppUser | null>(guest), admin: waiting() })))).toBe("ready"); // guests are never asked
    });
    it("no trip: the admin may start one; anyone else has no access", () => {
      expect(decideAccess(base({ trip: ok<Trip | null>(null) }))).toEqual({ kind: "no-trip", email: "me@example.com", isAdmin: true });
      expect(decideAccess(base({ trip: ok<Trip | null>(null), admin: ok(false) }))).toEqual({ kind: "no-access", email: "me@example.com" });
    });
  });

  describe("the role on the trip", () => {
    it("waits for it", () => {
      expect(kind(decideAccess(base({ role: waiting() })))).toBe("loading");
    });
    it("an error shows a retry; a role it already has survives a failed refresh", () => {
      expect(decideAccess(base({ role: failed<Role | null>(new Error("denied")) }))).toEqual({ kind: "error", message: "denied", source: "role" });
      expect(kind(decideAccess(base({ role: failed<Role | null>(new Error("x"), "viewer") })))).toBe("ready");
    });
    it("no role means no access; each role maps to what it may do", () => {
      expect(decideAccess(base({ role: ok<Role | null>(null) }))).toEqual({ kind: "no-access", email: "me@example.com" });
      expect(decideAccess(base({ role: ok<Role | null>("viewer"), admin: ok(false) }))).toMatchObject({ role: "viewer", canEdit: false });
      expect(decideAccess(base({ role: ok<Role | null>("editor"), admin: ok(false) }))).toMatchObject({ role: "editor", canEdit: true });
      expect(decideAccess(base({ role: ok<Role | null>("owner"), admin: ok(false) }))).toMatchObject({ role: "owner", canEdit: false });
    });
  });

  it("a dropped connection is described in one plain sentence", () => {
    const a = decideAccess(base({ trip: failed<Trip | null>(new Error("Failed to fetch")) }));
    expect(a).toEqual({ kind: "error", message: OFFLINE_MESSAGE, source: "trip" });
  });
});

describe("canEditAs", () => {
  it("only an editor, or an owner who is still an admin, can edit", () => {
    expect(canEditAs("owner", true)).toBe(true);
    expect(canEditAs("owner", false)).toBe(false);
    expect(canEditAs("editor", false)).toBe(true);
    expect(canEditAs("viewer", true)).toBe(false);
  });
});
