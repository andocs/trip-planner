"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme";

/** The slice of the Google Charts API this component uses. */
type GoogleCharts = {
  charts: {
    load: (version: string, opts: { packages: string[] }) => void;
    setOnLoadCallback: (cb: () => void) => void;
  };
  visualization: {
    arrayToDataTable: (rows: unknown[][]) => unknown;
    GeoChart: new (el: HTMLElement) => { draw: (data: unknown, options: Record<string, unknown>) => void };
  };
};
declare global {
  interface Window {
    google?: GoogleCharts;
  }
}

const LOADER = "https://www.gstatic.com/charts/loader.js";
let loading: Promise<GoogleCharts> | undefined;

/** Loads loader.js once per page, then the geochart package. Rejects after 10s. */
function loadGeoChart(): Promise<GoogleCharts> {
  loading ??= new Promise<GoogleCharts>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("timeout")), 10_000);
    const ready = () => {
      const g = window.google!;
      g.charts.load("current", { packages: ["geochart"] });
      g.charts.setOnLoadCallback(() => {
        clearTimeout(timeout);
        resolve(g);
      });
    };
    if (window.google?.charts) return ready();
    const s = document.createElement("script");
    s.src = LOADER;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("load failed"));
    };
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    loading = undefined; // allow a retry on the next mount
    throw e;
  });
  return loading;
}

export type MapStop = { city: string; country: string | null; nights: number; lat: number; lng: number };

/**
 * GeoChart in marker mode (lat/lng, so no geocoding and no API key). Marker size encodes nights.
 * Renders nothing visible on failure and reports it via `onError` so the caller shows the list.
 */
export function GeoMap({ stops, region, onError }: { stops: MapStop[]; region: string; onError: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();
  const [ready, setReady] = useState(false);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  // Redraw only when the data or theme actually changes, not on every parent render.
  const signature = JSON.stringify({ stops, region, theme });

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const { stops, region } = JSON.parse(signature) as { stops: MapStop[]; region: string };

    loadGeoChart()
      .then((g) => {
        if (cancelled || !ref.current) return;
        const el = ref.current;
        const css = getComputedStyle(el);
        const v = (name: string) => css.getPropertyValue(name).trim();
        const data = g.visualization.arrayToDataTable([
          ["Latitude", "Longitude", "City", "Nights"],
          ...stops.map((s) => [s.lat, s.lng, [s.city, s.country].filter(Boolean).join(", "), s.nights]),
        ]);
        const options = {
          region,
          displayMode: "markers",
          resolution: region === "world" || /^\d{3}$/.test(region) ? "countries" : "provinces",
          backgroundColor: "transparent",
          datalessRegionColor: v("--map-land"),
          defaultColor: v("--map-land"),
          colorAxis: { colors: [v("--chart-1"), v("--chart-1")] },
          sizeAxis: { minValue: 0, minSize: 7, maxSize: 18 },
          markerOpacity: 0.9,
          legend: "none",
          keepAspectRatio: true,
          tooltip: { textStyle: { fontName: "inherit" } },
        };
        const chart = new g.visualization.GeoChart(el);
        const draw = () => chart.draw(data, options);
        draw();
        setReady(true);
        let width = el.clientWidth;
        observer = new ResizeObserver(() => {
          if (Math.abs(el.clientWidth - width) > 8) {
            width = el.clientWidth;
            draw();
          }
        });
        observer.observe(el);
      })
      .catch(() => !cancelled && onErrorRef.current());

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [signature]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Map of ${stops.length} stops: ${stops.map((s) => `${s.city}, ${s.nights} nights`).join("; ")}`}
      className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-2 data-[ready=true]:bg-transparent"
      data-ready={ready}
    />
  );
}
