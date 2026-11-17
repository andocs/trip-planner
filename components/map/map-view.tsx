"use client";

import { APIProvider, AdvancedMarker, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { MapFallback } from "@/components/map/map-fallback";
import { useIsDark } from "@/lib/use-dark";
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

/**
 * The map: Google Maps (JavaScript API, a cloud-styled Map ID so it matches the app in light and night), numbered
 * stop discs, a dashed route, an optional "selected place" pin and optional place markers. Google draws its own
 * logo, terms link and copyright; nothing here covers them.
 *
 * Keys: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY (a browser key, restricted by HTTP referrer and to the Maps JavaScript
 * API) and NEXT_PUBLIC_GOOGLE_MAP_ID. Without a key, or if Google refuses to load (bad key, referrer, billing,
 * offline), the drawn stand-in is shown, and everything that needs the map has a non-map path (search, stop list).
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

export function MapView({
  stops,
  pin,
  places = [],
  onTap,
  onPlaceClick,
  insets = { top: 80, right: 24, bottom: 24, left: 24 },
  label = "Trip map",
  interactive = true,
  cooperative = false,
  arrows = false,
  className,
}: {
  stops: MapStop[];
  pin?: { lat: number; lng: number } | null;
  places?: MapPlace[];
  onTap?: (lat: number, lng: number) => void;
  onPlaceClick?: (id: string) => void;
  /** Space covered by overlapping panels; the map frames its content in what's left. */
  insets?: Insets;
  label?: string;
  /** false for a picture-only map (Home): no dragging or zooming, so the page scrolls normally. */
  interactive?: boolean;
  /** A map inside a scrolling page (a hero): Ctrl + scroll zooms and two fingers move it, so the page still scrolls over it. */
  cooperative?: boolean;
  /** Solid lines with an arrow on each leg, in the order of the stops (the order of travel). Otherwise a dashed line. */
  arrows?: boolean;
  className?: string;
}) {
  const dark = useIsDark();
  const [failed, setFailed] = useState(false);

  // Google calls this global when the key or referrer is refused after the script has loaded.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setFailed(true);
    return () => {
      delete w.gm_authFailure;
    };
  }, []);

  if (!KEY || failed) return <MapFallback className={className} />;
  return (
    <div className={cn("absolute inset-0 bg-[var(--sea)]", className)}>
      <APIProvider apiKey={KEY} language="en" onError={() => setFailed(true)}>
        <div className="size-full" role="application" aria-label={`${label}. A list of stops is always available.`}>
          <GoogleMap
            // The colour scheme can only be chosen when the map is created, so Light/Night remounts it.
            key={dark ? "dark" : "light"}
            mapId={MAP_ID}
            colorScheme={dark ? "DARK" : "LIGHT"}
            defaultCenter={{ lat: 20, lng: 105 }}
            defaultZoom={3}
            gestureHandling={interactive ? (cooperative ? "cooperative" : "greedy") : "none"}
            disableDefaultUI
            zoomControl={interactive}
            keyboardShortcuts={interactive}
            clickableIcons={false}
            onClick={(e) => {
              const ll = e.detail.latLng;
              if (ll && onTap) onTap(ll.lat, ll.lng);
            }}
            style={{ width: "100%", height: "100%" }}
          >
            <Framing stops={stops} pin={pin ?? null} places={places} insets={insets} />
            <Route stops={stops} arrows={arrows} />
            {stops.map((s, i) => (
              <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} title={s.name} clickable={false}>
                <div className="map-disc" aria-hidden="true">
                  <span className="map-disc-n">{s.label ?? i + 1}</span>
                  <span className="map-disc-l">{s.name}</span>
                </div>
              </AdvancedMarker>
            ))}
            {pin && (
              <AdvancedMarker position={pin} clickable={false}>
                <svg className="map-pin" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
                  <path
                    d="M17 43C5 27 0 19 0 13a17 17 0 0 1 34 0c0 6-5 14-17 30z"
                    fill="var(--route)"
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                  <circle cx="17" cy="14" r="6" fill="#fff" />
                </svg>
              </AdvancedMarker>
            )}
            {places.map((p) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.name}
                zIndex={p.state === "selected" ? 10 : p.state === "saved" ? 5 : 1}
                onClick={onPlaceClick ? () => onPlaceClick(p.id) : undefined}
              >
                <PlaceDisc place={p} />
              </AdvancedMarker>
            ))}
          </GoogleMap>
        </div>
      </APIProvider>
    </div>
  );
}

function PlaceDisc({ place }: { place: MapPlace }) {
  const base = "map-place grid place-items-center rounded-full font-bold ring-2 ring-[var(--surface)] shadow-float";
  if (place.state === "saved")
    return (
      <span className={cn(base, "size-8 bg-teal text-ground")} aria-label={`${place.name}, on your board`}>
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  if (place.state === "selected")
    return (
      <span className={cn(base, "size-10 bg-accent text-sm text-white")} aria-label={`${place.name}, selected`}>
        {place.n}
      </span>
    );
  return (
    <span className={cn(base, "size-[30px] bg-ink text-sm text-ground")} aria-label={place.name}>
      {place.n}
    </span>
  );
}

/** Frames what is on the map inside the space the panels leave free. Runs when the content changes. */
function Framing({
  stops,
  pin,
  places,
  insets,
}: {
  stops: MapStop[];
  pin: { lat: number; lng: number } | null;
  places: MapPlace[];
  insets: Insets;
}) {
  const map = useMap();
  const key = [
    pin ? `${pin.lat},${pin.lng}` : "",
    stops.map((s) => `${s.lat},${s.lng}`).join("|"),
    places.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ].join("#");
  const { top, right, bottom, left } = insets;
  useEffect(() => {
    if (!map) return;
    const pts: { lat: number; lng: number }[] = pin ? [pin] : [...stops, ...places];
    if (pts.length === 0) return;
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    if (pts.length === 1) {
      // One point: frame a small area around it, so the padding still shifts it clear of the panels.
      const p = pts[0];
      b.extend({ lat: p.lat + 1.1, lng: p.lng + 1.1 });
      b.extend({ lat: p.lat - 1.1, lng: p.lng - 1.1 });
    }
    map.fitBounds(b, { top, right, bottom, left });
    const once = google.maps.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z !== undefined && z > 15) map.setZoom(15);
    });
    return () => once.remove();
    // `key` stands for the content (stops, pin and places) so the effect doesn't re-run on identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, top, right, bottom, left]);
  return null;
}

/** The dashed route through the stops, in the same colour as the rest of the app. */
function Route({ stops, arrows }: { stops: MapStop[]; arrows: boolean }) {
  const map = useMap();
  const key = `${arrows}|` + stops.map((s) => `${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (!map || stops.length < 2) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--route").trim() || "#c93f1b";
    if (arrows) {
      // One solid leg per pair of consecutive stops, each with an arrow at its middle: the direction of travel.
      const legs = stops.slice(1).map((to, i) => {
        const from = stops[i];
        return new google.maps.Polyline({
          map,
          path: [
            { lat: from.lat, lng: from.lng },
            { lat: to.lat, lng: to.lng },
          ],
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 4,
          geodesic: false,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: color, fillColor: color, fillOpacity: 1 },
              offset: "50%",
            },
          ],
        });
      });
      return () => legs.forEach((l) => l.setMap(null));
    }
    const line = new google.maps.Polyline({
      map,
      path: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      strokeOpacity: 0,
      geodesic: false,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 2 },
          offset: "0",
          repeat: "10px",
        },
      ],
    });
    return () => line.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}
