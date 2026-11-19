"use client";

import dynamic from "next/dynamic";
import { useSharedMapField } from "@/components/map/shared-map";

const Host = dynamic(() => import("@/components/map/map-host"), { ssr: false });

/**
 * In the app layout, so the map outlives page changes. Nothing is loaded until a screen first asks for the map.
 * Do not merge this file into map-host.tsx: that file imports the Google code, and importing it statically from the
 * layout would load the map (a billed Google map load) on every screen.
 */
export function MapHostLazy() {
  const started = useSharedMapField("started");
  return started ? <Host /> : null;
}
