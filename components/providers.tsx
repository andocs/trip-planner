"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { OfflineCache } from "@/components/offline/offline-cache";
import { SYNCED_KEY } from "@/lib/offline/clear";
import { MAX_AGE_MS } from "@/lib/offline/persist";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime: the offline copy (lib/offline/persist.ts) is saved from this cache, and a saved query must not be
          // collected before the copy expires, or it would quietly drop out of the copy.
          queries: { staleTime: 30_000, gcTime: MAX_AGE_MS, refetchOnWindowFocus: true, retry: 1 },
          // "always": a save made without a connection fails at once (and rolls back with a message) instead of waiting
          // in a hidden queue. The offline mode is read-only on purpose.
          mutations: { retry: 0, networkMode: "always" },
        },
      }),
  );

  // Remember when the data on screen was last loaded from the server, for the "offline" banner.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((e) => {
        if (e.type === "updated" && e.action.type === "success" && navigator.onLine) {
          try {
            localStorage.setItem(SYNCED_KEY, String(Date.now()));
          } catch {}
        }
      }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineCache client={queryClient} />
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "!rounded-2xl !font-sans" }}
        offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      />
    </QueryClientProvider>
  );
}
