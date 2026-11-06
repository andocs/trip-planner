"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. False on the server and during hydration, so markup never mismatches. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
