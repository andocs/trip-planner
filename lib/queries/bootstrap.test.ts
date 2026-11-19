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
    expect((await fetchBootstrap(supabase))?.role).toBe("viewer");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("asks for one trip by id when given an id, and for the trip joined last otherwise", async () => {
    const { rpc, supabase } = client({ trip_bootstrap: { data: { user: { id: "u", email: null, is_anonymous: false }, trip, is_admin: true, role: "owner" } } });
    await fetchBootstrap(supabase, "11111111-1111-4111-8111-111111111111");
    expect(rpc).toHaveBeenLastCalledWith("trip_bootstrap", { p_trip: "11111111-1111-4111-8111-111111111111" });
    await fetchBootstrap(supabase, null);
    expect(rpc).toHaveBeenLastCalledWith("trip_bootstrap");
    await fetchBootstrap(supabase);
    expect(rpc).toHaveBeenLastCalledWith("trip_bootstrap");
  });
  it("throws errors, including a missing function", async () => {
    for (const code of ["42501", "PGRST202"]) {
      const { supabase } = client({ trip_bootstrap: { error: { code } } });
      await expect(fetchBootstrap(supabase)).rejects.toBeTruthy();
    }
  });
});
