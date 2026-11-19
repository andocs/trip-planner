"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/gate/error-screen";
import "./globals.css";

/** Last resort: the root layout itself failed, so this page brings its own <html> and <body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("global error", error.digest ?? "no-digest");
  }, [error]);
  return (
    <html lang="en">
      <body className="min-h-full">
        <ErrorScreen onRetry={reset} />
      </body>
    </html>
  );
}
