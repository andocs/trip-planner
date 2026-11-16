import { describe, expect, it, vi } from "vitest";
import { fetchBootstrap, parseBootstrap } from "./bootstrap";

const trip = { id: "t1", name: "Trip" };

describe("parseBootstrap", () => {
  it("maps the RPC json", () => {
    expect(
      parseBootstrap({ user: { id: "u", email: "a@b.c", is_anonymous: false }, trip, is_admin: true, role: "owner" }),
    ).toEqual({ user: { id: "u", email: "a@b.c", isAnonymous: false }, trip, isAdmin: true, role: "owner" });
  });
  it("handles anonymous viewers with no trip", () => {
    expect(
      parseBootstrap({ user: { id: "u", email: null, is_anonymous: true }, trip: null, is_admin: false, role: null }),
    ).toEqual({
      user: { id: "u", email: null, isAnonymous: true },
      trip: null,
      isAdmin: false,
      role: null,
    });
  });
  it("rejects junk and unknown roles", () => {
    expect(parseBootstrap(null)).toBeNull();
    expect(parseBootstrap({})).toBeNull();
    expect(parseBootstrap({ user: { id: "u" }, role: "root" })?.role).toBeNull();
  });
});

type Reply = { data?: unknown; error?: { code: string } | null };
const client = (replies: Record<string, Reply>) => {
  const rpc = vi.fn(async (name: string) => ({ data: null, error: null, ...replies[name] }));
  return { rpc, supabase: { rpc } as never };
};

describe("fetchBootstrap", () => {
  it("uses a single RPC when available", async () => {
    const { rpc, supabase } = client({
      trip_bootstrap: {
        data: { user: { id: "u", email: null, is_anonymous: true }, trip, is_admin: false, role: "viewer" },
      },
    });
    expect((await fetchBootstrap(supabase, null))?.role).toBe("viewer");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("falls back to the legacy calls when the function is missing", async () => {
    const { rpc, supabase } = client({
      trip_bootstrap: { error: { code: "PGRST202" } },
      active_trip: { data: [trip] },
      is_admin: { data: true },
      trip_role: { data: "owner" },
    });
    const user = { id: "u", email: "a@b.c", isAnonymous: false };
    expect(await fetchBootstrap(supabase, user)).toEqual({ user, trip, isAdmin: true, role: "owner" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["trip_bootstrap", "active_trip", "is_admin", "trip_role"]);
  });
  it("skips is_admin for anonymous users in the fallback, and returns null without a user", async () => {
    const missing = { trip_bootstrap: { error: { code: "PGRST202" } }, active_trip: { data: [] } };
    const a = client(missing);
    await fetchBootstrap(a.supabase, { id: "u", email: null, isAnonymous: true });
    expect(a.rpc.mock.calls.map((c) => c[0])).toEqual(["trip_bootstrap", "active_trip"]);
    expect(await fetchBootstrap(client(missing).supabase, null)).toBeNull();
  });
  it("throws other errors", async () => {
    const { supabase } = client({ trip_bootstrap: { error: { code: "42501" } } });
    await expect(fetchBootstrap(supabase, null)).rejects.toBeTruthy();
  });
});
