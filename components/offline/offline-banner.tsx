"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SYNCED_KEY } from "@/lib/offline/clear";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** True while the browser has a connection. The server and the first client render say "online", so hydration matches. */
export const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

/** "Tue 2:05 PM" from the saved timestamp, or null when there is none. */
export function syncedLabel(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

const readSynced = (): number | null => {
  try {
    const v = Number(localStorage.getItem(SYNCED_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};

/** Shown at the top of every screen while there is no connection: what you are looking at, and that edits can't be saved. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  const when = syncedLabel(readSynced());
  return (
    <div role="status" className="mb-3 flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-sm font-bold text-fg">
      <WifiOff className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <span>
        You&apos;re offline{" "}
        <span className="font-medium text-fg-muted">
          · showing {when ? `what was saved ${when}` : "the last saved copy"}. Changes can&apos;t be saved until you&apos;re back online.
        </span>
      </span>
    </div>
  );
}
