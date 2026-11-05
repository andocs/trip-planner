"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * A value that only exists in the browser (today's local date, navigator features).
 * Renders `fallback` on the server and during hydration, then the real value, so the
 * server HTML and the first client render always match.
 */
export function useClientValue<T>(read: () => T, fallback: T): T {
  return useSyncExternalStore(noSubscribe, read, () => fallback);
}
