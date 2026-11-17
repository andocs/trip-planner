"use client";

import dynamic from "next/dynamic";
import { useSharedMapField } from "@/components/map/shared-map";

const Host = dynamic(() => import("@/components/map/map-host"), { ssr: false });

/** In the app layout, so the map outlives page changes. Nothing is loaded until a screen first asks for the map. */
export function MapHostLazy() {
  const started = useSharedMapField("started");
  return started ? <Host /> : null;
}
