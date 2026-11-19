import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";
import { errorMessage, OFFLINE_MESSAGE } from "@/lib/utils";
import { BUSTER, MAX_AGE_MS, mergeCopies, ownerOf, shouldPersist, usableCopy } from "./persist";

const q = (queryKey: unknown[], status = "success") => ({ queryKey, state: { status } }) as never;

describe("shouldPersist: what the saved copy may contain", () => {
  it("keeps the session answers the gate needs and the trip's own tables", () => {
    for (const key of [["user"], ["bootstrap"], ["is-admin"], ["trip-role", "t1"], ["active-trip"], ["trip", "t1", "expenses"], ["trip", "t1", "itinerary_items"], ["trip", "t1", "flights"], ["trip", "t1", "stays"]])
      expect(shouldPersist(q(key)), JSON.stringify(key)).toBe(true);
  });
  it("never keeps booking references or photo links", () => {
    expect(shouldPersist(q(["trip", "t1", "flight_refs"]))).toBe(false);
    expect(shouldPersist(q(["trip", "t1", "item_images"]))).toBe(false);
  });
  it("never keeps the member list, claimable trips, the share link or anything it does not know", () => {
    for (const key of [["trip-members", "t1"], ["claimable-trips"], ["share", "t1"], ["shared-trip", "tok"], ["something-new", "x"], [1, 2], []])
      expect(shouldPersist(q(key as unknown[])), JSON.stringify(key)).toBe(false);
  });
  it("keeps only answers that arrived", () => {
    expect(shouldPersist(q(["user"], "pending"))).toBe(false);
    expect(shouldPersist(q(["trip", "t1", "expenses"], "error"))).toBe(false);
  });
});

const copy = (userId: unknown, over: Partial<PersistedClient> = {}): PersistedClient => ({
  timestamp: 1_000_000,
  buster: BUSTER,
  clientState: { mutations: [], queries: userId === undefined ? [] : [{ queryKey: ["user"], queryHash: '["user"]', state: { data: { id: userId } } }] } as never,
  ...over,
});

describe("ownerOf / usableCopy: a saved copy belongs to one person", () => {
  it("reads the owner from the saved user answer", () => {
    expect(ownerOf(copy("u1"))).toBe("u1");
    expect(ownerOf(copy(undefined))).toBeNull();
    expect(ownerOf(copy(42))).toBeNull();
  });
  it("is used only by the same signed-in person, while fresh, from this deploy", () => {
    const now = 1_000_000 + 1000;
    expect(usableCopy(copy("u1"), "u1", now)).toBeDefined();
    expect(usableCopy(copy("u1"), "u2", now)).toBeUndefined(); // someone else signed in
    expect(usableCopy(copy("u1"), null, now)).toBeUndefined(); // nobody signed in
    expect(usableCopy(copy("u1"), "u1", 1_000_000 + MAX_AGE_MS + 1)).toBeUndefined(); // too old
    expect(usableCopy(copy("u1", { buster: "other-deploy" }), "u1", now)).toBeUndefined(); // an older deploy's shapes
    expect(usableCopy(undefined, "u1", now)).toBeUndefined();
    expect(usableCopy(copy(undefined), "u1", now)).toBeUndefined(); // no owner recorded
  });
});

describe("errorMessage: a dropped connection gets one plain sentence", () => {
  it("rewrites what browsers say when a request never reached the server", () => {
    for (const m of ["Failed to fetch", "TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "Network request failed"]) {
      expect(errorMessage(new Error(m))).toBe(OFFLINE_MESSAGE);
      expect(errorMessage({ message: m })).toBe(OFFLINE_MESSAGE); // a Supabase error object
    }
  });
  it("leaves real errors alone", () => {
    expect(errorMessage(new Error("duplicate key value"))).toBe("duplicate key value");
    expect(errorMessage({ message: "permission denied" })).toBe("permission denied");
    expect(errorMessage(null)).toBe("Something went wrong");
    expect(errorMessage(undefined, "custom")).toBe("custom");
  });
});

const withQueries = (userId: string | undefined, hashes: string[], over: Partial<PersistedClient> = {}): PersistedClient => {
  const base = copy(userId, over);
  const extra = hashes.map((h) => ({ queryKey: ["trip", "t1", h], queryHash: JSON.stringify(["trip", "t1", h]), state: { data: h + "-from-" + String(over.timestamp ?? base.timestamp) } }));
  return { ...base, clientState: { ...base.clientState, queries: [...base.clientState.queries, ...extra] } as never };
};
const hashesOf = (c: PersistedClient) => c.clientState.queries.map((x) => (x.queryKey as unknown[])[2] ?? "user").sort();

describe("mergeCopies: a save never shrinks what was saved", () => {
  const now = 1_000_000 + 1000;
  it("keeps older queries the new save does not have, and lets the new one win where both have it", () => {
    const old = withQueries("u1", ["flights", "stays", "expenses"], { timestamp: 1_000_000 });
    const next = withQueries("u1", ["expenses"], { timestamp: 1_000_500 });
    const merged = mergeCopies(old, next, now);
    expect(hashesOf(merged)).toEqual(["expenses", "flights", "stays", "user"]);
    const expenses = merged.clientState.queries.find((q) => (q.queryKey as unknown[])[2] === "expenses")!;
    expect((expenses.state as { data: unknown }).data).toBe("expenses-from-1000500");
    expect(merged.timestamp).toBe(1_000_500);
  });
  it("still merges when the new save has no user answer yet (a half-loaded session)", () => {
    const old = withQueries("u1", ["flights"], { timestamp: 1_000_000 });
    const next = withQueries(undefined, ["expenses"], { timestamp: 1_000_500 });
    expect(hashesOf(mergeCopies(old, next, now))).toEqual(["expenses", "flights", "user"]);
  });
  it("replaces, not merges, an old copy of a different person, another deploy, or past its age", () => {
    const next = withQueries("u2", ["expenses"], { timestamp: 1_000_500 });
    expect(mergeCopies(withQueries("u1", ["flights"]), next, now)).toBe(next);
    expect(mergeCopies(withQueries("u2", ["flights"], { buster: "old-deploy" }), next, now)).toBe(next);
    expect(mergeCopies(withQueries("u2", ["flights"], { timestamp: 1_000_000 }), next, 1_000_000 + MAX_AGE_MS + 1)).toBe(next);
    expect(mergeCopies(undefined, next, now)).toBe(next);
  });
});
