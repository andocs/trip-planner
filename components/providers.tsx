"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime: keep screens' data for 30 min so returning to a tab never starts from a skeleton.
          queries: { staleTime: 30_000, gcTime: 30 * 60_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
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
