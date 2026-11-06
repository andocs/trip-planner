"use client";

import { createContext, use, type ReactNode } from "react";
import type { MapStyles } from "@/lib/map-styles";

const MapStylesContext = createContext<MapStyles>({
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
});

export function MapStylesProvider({ styles, children }: { styles: MapStyles; children: ReactNode }) {
  return <MapStylesContext value={styles}>{children}</MapStylesContext>;
}

export const useMapStyles = () => use(MapStylesContext);
