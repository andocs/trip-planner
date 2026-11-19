"use client";

import { useEffect } from "react";
import { WARMED_KEY } from "@/lib/offline/clear";

/** The screens the service worker keeps a copy of (keep in step with APP_PATHS in public/sw.js). */
export const APP_PATHS = ["/", "/itinerary", "/flights", "/stays", "/places", "/spend", "/pack", "/settings"];
const WARM_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * Registers the service worker (production only) and, at most every 12 hours, asks it to save a copy of each main screen,
 * so any of them opens without signal. Renders nothing. Lives inside the signed-in app, so it only ever runs for someone
 * who has a session. A browser without service workers, or one that blocks them, just keeps working online as before.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (cancelled || !navigator.onLine || !reg.active) return;
        let last = 0;
        try {
          last = Number(localStorage.getItem(WARMED_KEY)) || 0;
        } catch {}
        if (Date.now() - last < WARM_EVERY_MS) return;
        // Wait for the page's own loading to settle before asking for eight more screens.
        window.setTimeout(() => {
          if (cancelled || !navigator.onLine) return;
          reg.active?.postMessage({ type: "warm", urls: APP_PATHS.filter((p) => p !== window.location.pathname) });
          try {
            localStorage.setItem(WARMED_KEY, String(Date.now()));
          } catch {}
        }, 8000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
