"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/gate/error-screen";

/** Catches errors thrown while rendering any page below the root layout, so a crash is not a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest: it matches the server log line without putting details in the console of a shared device.
    console.error("page error", error.digest ?? "no-digest");
  }, [error]);
  return <ErrorScreen onRetry={reset} />;
}
