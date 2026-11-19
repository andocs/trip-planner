import type { Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { kvDelete, kvGet, kvSet } from "./store";

/**
 * Offline copy of the trip (read-only). The query cache is saved to IndexedDB so the app can open without signal and show
 * what was last loaded. Rules:
 *  - Only the trip's own data and the session answers the gate needs are saved (see `shouldPersist`).
 *  - Booking references (flight_refs), the member list, share links and anything else are NEVER saved.
 *  - The copy belongs to one account: if a different person (or nobody) is signed in, it is thrown away unread.
 *  - It expires after 14 days and with every new deploy (`BUSTER`), so old data shapes never meet new code.
 *  - Saves are merged into the existing copy, so a half-loaded session can never shrink what was saved.
 *  - Signing out deletes it and switches saving off for the rest of that page (clearOfflineData -> blockPersistence).
 */
export const CACHE_KEY = "query-cache";
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const BUSTER = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev";

/** Trip tables that stay out of the saved copy: owner-only secrets, and files that are only valid for an hour. */
const NEVER_SAVED = new Set(["flight_refs", "item_images"]);
const SESSION_KEYS = new Set(["user", "bootstrap", "is-admin", "trip-role", "active-trip", "my-trips"]);

export function shouldPersist(query: Pick<Query, "queryKey" | "state">): boolean {
  if (query.state.status !== "success") return false;
  const [head, , table] = query.queryKey as unknown[];
  if (typeof head !== "string") return false;
  if (SESSION_KEYS.has(head)) return true;
  return head === "trip" && typeof table === "string" && !NEVER_SAVED.has(table);
}

/** Who a saved copy belongs to: the id inside its own `user` query. */
export function ownerOf(client: PersistedClient): string | null {
  const q = client.clientState.queries.find((x) => (x.queryKey as unknown[])[0] === "user");
  const data = q?.state.data as { id?: unknown } | null | undefined;
  return typeof data?.id === "string" ? data.id : null;
}

/** Same copy, only if it is for the signed-in person and still fresh enough. */
export function usableCopy(client: PersistedClient | undefined, currentUserId: string | null, now: number): PersistedClient | undefined {
  if (!client || !currentUserId) return undefined;
  if (client.buster !== BUSTER || now - client.timestamp > MAX_AGE_MS) return undefined;
  return ownerOf(client) === currentUserId ? client : undefined;
}

/**
 * The new save laid over the old one: every query in the new save replaces its older self, every other saved query stays.
 * An old copy of a different person, from another deploy or past its age is not merged in (it is simply replaced).
 */
export function mergeCopies(old: PersistedClient | undefined, next: PersistedClient, now: number): PersistedClient {
  const nextOwner = ownerOf(next);
  const oldOwner = old ? ownerOf(old) : null;
  const sameOwner = !!old && oldOwner !== null && (nextOwner === null || nextOwner === oldOwner);
  if (!old || !sameOwner || old.buster !== next.buster || now - old.timestamp > MAX_AGE_MS) return next;
  const byHash = new Map(old.clientState.queries.map((q) => [q.queryHash, q]));
  for (const q of next.clientState.queries) byHash.set(q.queryHash, q);
  return { ...next, clientState: { ...next.clientState, queries: [...byHash.values()] } };
}

let blocked = false;
/** After this, nothing more is written to the saved copy until the page is reloaded (used when someone signs out). */
export const blockPersistence = () => {
  blocked = true;
};

/** A persister that does nothing on the server and where IndexedDB is unavailable. */
export function createOfflinePersister(currentUserId: () => Promise<string | null>): Persister {
  const enabled = typeof indexedDB !== "undefined";
  // Every cache update asks for a save; one write every 2 seconds (the latest state) is plenty.
  let latest: PersistedClient | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    timer = undefined;
    const client = latest;
    latest = undefined;
    if (!client || blocked) return;
    const merged = mergeCopies(await kvGet<PersistedClient>(CACHE_KEY), client, Date.now());
    if (!blocked) await kvSet(CACHE_KEY, merged);
  };
  return {
    persistClient: async (client) => {
      if (!enabled || blocked) return;
      latest = client;
      timer ??= setTimeout(() => void flush(), 2000);
    },
    restoreClient: async () => {
      if (!enabled) return undefined;
      const saved = await kvGet<PersistedClient>(CACHE_KEY);
      const usable = usableCopy(saved, await currentUserId(), Date.now());
      if (saved && !usable) await kvDelete(CACHE_KEY); // someone else's, expired or from an older deploy: gone
      return usable;
    },
    removeClient: async () => {
      if (enabled) await kvDelete(CACHE_KEY);
    },
  };
}
