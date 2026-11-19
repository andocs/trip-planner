"use client";

import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { useEffect } from "react";
import { BUSTER, createOfflinePersister, MAX_AGE_MS, shouldPersist } from "@/lib/offline/persist";
import { getCurrentUser } from "@/lib/supabase/client";
import { errorMessage, OFFLINE_MESSAGE } from "@/lib/utils";

const currentUserId = async () => {
  try {
    return (await getCurrentUser())?.id ?? null;
  } catch {
    return null; // Supabase not configured, or no session
  }
};

/**
 * Keeps the offline copy of the trip (lib/offline/persist.ts), and decides WHEN the saved copy may be used.
 *
 * It is used only when the app has no connection: at the start if the browser is offline, when the connection drops, or
 * when the first request fails because the server can't be reached (a signal that says "connected" but is not). Online,
 * the saved copy is never read, so fresh data always wins and there is nothing stale to show.
 *
 * It is also never merged in before the page has finished hydrating. The page is streamed, and parts of it hydrate after
 * the first effects run: if the saved data landed in the cache first, those parts would render from it instead of from
 * what the server sent, and React would report a hydration mismatch (seen in testing, so this ordering is deliberate).
 * Saving starts only after that point too.
 */
export function OfflineCache({ client }: { client: QueryClient }) {
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const persister = createOfflinePersister(currentUserId);
    const opts = { queryClient: client, persister, maxAge: MAX_AGE_MS, buster: BUSTER };
    let cancelled = false;
    let restored = false;
    let stopSaving = () => {};

    // "Hydration has settled": the page has loaded, plus a moment for the streamed parts.
    const settled = new Promise<void>((resolve) => {
      const wait = () => window.setTimeout(resolve, 1200);
      if (document.readyState === "complete") wait();
      else window.addEventListener("load", wait, { once: true });
    });

    const restore = async () => {
      if (restored) return;
      restored = true;
      await settled;
      if (cancelled) return;
      try {
        await persistQueryClientRestore(opts);
      } catch {
        // a damaged copy is simply not used
      }
    };

    void (async () => {
      await settled;
      if (cancelled) return;
      if (!navigator.onLine) await restore();
      if (cancelled) return;
      // Saving starts after any restore, so it can't overwrite the saved copy with a smaller one.
      const saving = { ...opts, dehydrateOptions: { shouldDehydrateQuery: shouldPersist } };
      stopSaving = persistQueryClientSubscribe(saving);
      // What loaded before saving began (the usual case: the page is already loaded) is saved now, not at the next change.
      void persistQueryClientSave(saving);
    })();

    const onOffline = () => void restore();
    window.addEventListener("offline", onOffline);
    const stopWatching = client.getQueryCache().subscribe((e) => {
      if (!restored && e.type === "updated" && e.action.type === "error" && errorMessage(e.action.error) === OFFLINE_MESSAGE) void restore();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      stopWatching();
      stopSaving();
    };
  }, [client]);
  return null;
}
