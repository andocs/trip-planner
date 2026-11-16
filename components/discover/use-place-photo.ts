"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useGooglePhoto, useWikiPhoto } from "@/lib/queries/places";
import type { PlaceCard } from "@/lib/places/types";

/** true once the element has been near the viewport (so off-screen cards never trigger a photo lookup). */
export function useNearViewport<T extends Element>(rootMargin = "200px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);
  return [ref, near];
}

export type PlacePhoto =
  | { kind: "wiki"; url: string; credit: string; href: string; license: string }
  | { kind: "google"; url: string; credit: string; href: string | null; license: null }
  | { kind: "none"; loading: boolean };

/**
 * Wikimedia first (free), then Google. The Google photo is a scarce, billed call, so it is only requested when
 * `google` is true (the owner opened the place) and no free photo exists.
 */
export function usePlacePhoto(card: PlaceCard, { enabled, google }: { enabled: boolean; google: boolean }): PlacePhoto {
  const wiki = useWikiPhoto(card, enabled);
  const wantGoogle = google && wiki.isSuccess && !wiki.data && !!card.photo;
  const g = useGooglePhoto(card.photo?.name, wantGoogle);

  if (wiki.data)
    return {
      kind: "wiki",
      url: wiki.data.url,
      credit: `${wiki.data.author}, ${wiki.data.license}`,
      href: wiki.data.pageUrl,
      license: wiki.data.license,
    };
  if (g.data?.uri) {
    const a = card.photo?.authors[0];
    return {
      kind: "google",
      url: g.data.uri,
      credit: a?.name ?? "Google Maps user",
      href: a?.uri ?? null,
      license: null,
    };
  }
  return { kind: "none", loading: wiki.isFetching || g.isFetching };
}
