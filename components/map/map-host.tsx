"use client";

import { createPortal } from "react-dom";
import { MapScene } from "@/components/map/map-scene";
import { mapHost, useSharedMap } from "@/components/map/shared-map";

/** Keeps the one Google map alive in its detached host element, whichever screen it is in (or none). Loaded on first use. */
export default function MapHost() {
  const s = useSharedMap();
  return createPortal(<MapScene {...(s.props ?? { stops: [] })} attach={s.attach} />, mapHost());
}
