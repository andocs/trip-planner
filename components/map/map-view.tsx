"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { MapFallback } from "@/components/map/map-fallback";
import { useMapStyles } from "@/components/map/map-config";
import { useIsDark } from "@/lib/use-dark";
import { cn } from "@/lib/utils";

export type MapStop = { id: string | number; name: string; lat: number; lng: number };
type Insets = { top: number; right: number; bottom: number; left: number };

/**
 * The map: MapLibre GL with an OpenStreetMap vector style (light and night), numbered stop discs,
 * a dashed route and an optional "selected place" pin. Loads on demand. If WebGL or the style is
 * unavailable it shows a drawn stand-in, and everything that needs the map has a non-map path
 * (search, stop list).
 */
export function MapView({
  stops,
  pin,
  onTap,
  insets = { top: 80, right: 24, bottom: 24, left: 24 },
  label = "Trip map",
  interactive = true,
  className,
}: {
  stops: MapStop[];
  pin?: { lat: number; lng: number } | null;
  onTap?: (lat: number, lng: number) => void;
  /** Space covered by overlapping panels; the map frames its content in what's left. */
  insets?: Insets;
  label?: string;
  /** false for a picture-only map (Home): no dragging or zooming, so the page scrolls normally. */
  interactive?: boolean;
  className?: string;
}) {
  const styles = useMapStyles();
  const dark = useIsDark();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const tap = useRef(onTap);
  const latest = useRef({ stops, pin, insets });
  useEffect(() => {
    tap.current = onTap;
    latest.current = { stops, pin, insets };
  });
  const styleUrl = dark ? styles.dark : styles.light;
  const firstStyle = useRef(styleUrl);
  const firstInteractive = useRef(interactive);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !el.current) return;
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        lib.current = ml;
        const m = new ml.Map({
          container: el.current,
          style: firstStyle.current,
          center: [105, 20],
          zoom: 1.6,
          attributionControl: {
            compact: true,
            customAttribution:
              '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
          },
          interactive: firstInteractive.current,
        });
        map.current = m;
        m.on("click", (e) => tap.current?.(e.lngLat.lat, e.lngLat.lng));
        m.on("error", (e) => {
          // A style that never loads (offline, bad URL) leaves a blank map: switch to the stand-in.
          if (!m.isStyleLoaded() && /style|404|fetch|Failed/i.test(String(e.error?.message ?? ""))) setFailed(true);
        });
        m.once("load", () => setReady(true));
        ro = new ResizeObserver(() => m.resize());
        ro.observe(el.current);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  // Light / Night: swap the style, then redraw the route.
  const appliedStyle = useRef(firstStyle.current);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || appliedStyle.current === styleUrl) return;
    appliedStyle.current = styleUrl;
    m.setStyle(styleUrl);
    m.once("style.load", () => drawRoute());
  }, [styleUrl, ready]);

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function drawRoute() {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const coords = latest.current.stops.map((s) => [s.lng, s.lat]);
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coords.length > 1 ? coords : [] },
    };
    const src = m.getSource("route") as import("maplibre-gl").GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      m.addSource("route", { type: "geojson", data });
      const color = getComputedStyle(document.documentElement).getPropertyValue("--route").trim() || "#c93f1b";
      m.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 3, "line-dasharray": [0.1, 2.4] },
      });
    }
  }

  // Stops, route, pin and framing.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!m || !ml || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];

    stops.forEach((s, i) => {
      const node = document.createElement("div");
      node.className = "map-disc";
      node.setAttribute("aria-hidden", "true");
      node.innerHTML = `<span class="map-disc-n">${i + 1}</span><span class="map-disc-l">${escapeHtml(s.name)}</span>`;
      markers.current.push(new ml.Marker({ element: node, anchor: "center" }).setLngLat([s.lng, s.lat]).addTo(m));
    });
    if (pin) {
      const node = document.createElement("div");
      node.className = "map-pin";
      node.setAttribute("aria-hidden", "true");
      node.innerHTML =
        '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43C5 27 0 19 0 13a17 17 0 0 1 34 0c0 6-5 14-17 30z" fill="var(--route)" stroke="var(--surface)" stroke-width="2"/><circle cx="17" cy="14" r="6" fill="#fff"/></svg>';
      markers.current.push(new ml.Marker({ element: node, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(m));
    }

    const draw = () => drawRoute();
    if (m.isStyleLoaded()) draw();
    else m.once("idle", draw);

    const duration = reduced() ? 0 : 700;
    const padding = latest.current.insets;
    if (pin) {
      m.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(m.getZoom(), 6), duration, padding });
    } else if (stops.length === 1) {
      m.easeTo({ center: [stops[0].lng, stops[0].lat], zoom: 6, duration, padding });
    } else if (stops.length > 1) {
      const b = new ml.LngLatBounds();
      stops.forEach((s) => b.extend([s.lng, s.lat]));
      m.fitBounds(b, { padding, duration, maxZoom: 9 });
    }
  }, [stops, pin, ready]);

  if (failed) return <MapFallback className={className} />;
  return (
    <div className={cn("absolute inset-0 bg-[var(--sea)]", className)}>
      <div
        ref={el}
        className="size-full"
        role="application"
        aria-label={`${label}. A list of stops is always available.`}
      />
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
