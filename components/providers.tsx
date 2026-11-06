"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { MapStylesProvider } from "@/components/map/map-config";
import type { MapStyles } from "@/lib/map-styles";

export function Providers({ children, mapStyles }: { children: ReactNode; mapStyles: MapStyles }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MapStylesProvider styles={mapStyles}>{children}</MapStylesProvider>
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
