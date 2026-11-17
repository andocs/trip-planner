"use client";

import { useEffect, useRef, useState } from "react";
import { MapFallback } from "@/components/map/map-fallback";
import { claimMap, markMapFailed, releaseMap, updateMap, useSharedMapField } from "@/components/map/shared-map";
import { cn } from "@/lib/utils";

export type MapStop = { id: string | number; name: string; lat: number; lng: number; /** The number shown on the disc (defaults to its place in the list). */ label?: number };
/** A suggested or saved place drawn on the map (Discover). `n` is its number in the list beside it. */
export type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  n: number;
  state: "suggestion" | "saved" | "selected";
};
type Insets = { top: number; right: number; bottom: number; left: number };

export type MapViewProps = {
  stops: MapStop[];
  pin?: { lat: number; lng: number } | null;
  places?: MapPlace[];
  onTap?: (lat: number, lng: number) => void;
  onPlaceClick?: (id: string) => void;
  /** Itinerary: a stop's disc can be clicked (it is highlighted while `selectedId` names it). */
  onStopClick?: (id: string) => void;
  selectedId?: string | null;
  /** Change this number to frame all the stops again (a day was picked, the map was resized), even if they didn't change. */
  refit?: number;
  /** Space covered by overlapping panels; the map frames its content in what's left. */
  insets?: Insets;
  label?: string;
  /** false for a picture-only map (Home): no dragging or zooming, so the page scrolls normally. */
  interactive?: boolean;
  /** A map inside a scrolling page (a hero): Ctrl + scroll zooms and two fingers move it, so the page still scrolls over it. */
  cooperative?: boolean;
  /** Solid lines with an arrow on each leg, in the order of the stops (the order of travel). Otherwise a dashed line. */
  arrows?: boolean;
  /** Draw the stand-in (no Google load) while there is nothing to show: no stops, places or pin. */
  requireContent?: boolean;
  className?: string;
};

/**
 * A place on a screen for the map. The map is Google Maps (JavaScript API, a cloud-styled Map ID so it matches the app
 * in light and night), numbered stop discs, a route and an optional pin, drawn by `map-scene.tsx`.
 *
 * Every map that Google creates is a billed load, so there is ONE map for the whole app session (`shared-map.ts`): it is
 * created the first time a screen shows it on screen with the tab in front, and is then moved into whichever screen
 * (Home, Itinerary, Discover, the wizard) is showing, instead of being built again. This component holds the box the
 * map is moved into; it has no Google code, so screens that use it stay light.
 *
 * Keys: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY (a browser key, restricted by HTTP referrer and to the Maps JavaScript API)
 * and NEXT_PUBLIC_GOOGLE_MAP_ID. Without a key, or if Google refuses to load (bad key, referrer, billing, offline), the
 * drawn stand-in is shown, and everything that needs the map has a non-map path (search, stop list).
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export function MapView({ className, requireContent = false, ...scene }: MapViewProps) {
  const failed = useSharedMapField("failed");
  const [owner] = useState(() => Symbol("map"));
  const box = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const empty = requireContent && scene.stops.length === 0 && !scene.places?.length && !scene.pin;
  const stand = !KEY || failed || empty;

  // Google calls this global when the key or referrer is refused after the script has loaded.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = markMapFailed;
    return () => {
      delete w.gm_authFailure;
    };
  }, []);

  // The map is wanted only once this box is on screen and the tab is in front (a page opened in the background, or a map
  // scrolled far below, costs nothing).
  useEffect(() => {
    const el = box.current;
    if (armed || stand || !el) return;
    let seen = false;
    const check = () => {
      if (seen && document.visibilityState === "visible") setArmed(true);
    };
    const io = new IntersectionObserver((entries) => {
      seen = entries.some((e) => e.isIntersecting);
      check();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", check);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", check);
    };
  }, [armed, stand]);

  // Take the map into this box, and give it up (without destroying it) when this screen goes away.
  useEffect(() => {
    const el = box.current;
    if (!armed || stand || !el) return;
    claimMap(owner, el, scene);
    return () => releaseMap(owner, el);
    // The first props go in with the claim; later changes are published below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, stand, owner]);

  // Whatever this screen shows now: stops, pin, selection.
  useEffect(() => {
    if (armed && !stand) updateMap(owner, scene);
  });

  if (stand) return <MapFallback className={className} />;
  return <div ref={box} className={cn("absolute inset-0 bg-[var(--sea)]", className)} />;
}
