"use client";

import { APIProvider, AdvancedMarker, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { Check } from "lucide-react";
import { useEffect } from "react";
import type { MapPlace, MapStop } from "@/components/map/map-view";
import { markMapFailed, type SceneProps } from "@/components/map/shared-map";
import { useIsDark } from "@/lib/use-dark";
import { cn } from "@/lib/utils";

type Insets = { top: number; right: number; bottom: number; left: number };
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

/**
 * The one Google map, drawn into the shared host element (see shared-map.ts). Whatever screen has the map passes its
 * stops, pin and places; the map itself is never rebuilt when the screen changes, only re-framed.
 */
export function MapScene({
  stops,
  pin,
  places = [],
  onTap,
  onPlaceClick,
  onStopClick,
  selectedId,
  refit = 0,
  insets = { top: 80, right: 24, bottom: 24, left: 24 },
  label = "Trip map",
  interactive = true,
  cooperative = false,
  arrows = false,
  attach,
}: SceneProps & { attach: number }) {
  const dark = useIsDark();
  if (!KEY) return null;
  return (
    <APIProvider apiKey={KEY} language="en" onError={markMapFailed}>
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
          <Framing stops={stops} pin={pin ?? null} places={places} insets={insets} refit={refit} attach={attach} />
          <PanToSelected stops={stops} selectedId={selectedId ?? null} />
          <Route stops={stops} arrows={arrows} />
          {stops.map((s, i) => (
            <AdvancedMarker
              key={s.id}
              position={{ lat: s.lat, lng: s.lng }}
              title={s.name}
              clickable={!!onStopClick}
              zIndex={selectedId === s.id ? 20 : 1}
              onClick={onStopClick ? () => onStopClick(String(s.id)) : undefined}
            >
              <div className={cn("map-disc", onStopClick && "is-clickable", selectedId === s.id && "is-selected")} aria-hidden={onStopClick ? undefined : true}>
                <span className="map-disc-n">{s.label ?? i + 1}</span>
                <span className="map-disc-l">{s.name}</span>
              </div>
            </AdvancedMarker>
          ))}
          {pin && (
            <AdvancedMarker position={pin} clickable={false}>
              <svg className="map-pin" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
                <path d="M17 43C5 27 0 19 0 13a17 17 0 0 1 34 0c0 6-5 14-17 30z" fill="var(--route)" stroke="var(--surface)" strokeWidth="2" />
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
  refit,
  attach,
}: {
  stops: MapStop[];
  pin: { lat: number; lng: number } | null;
  places: MapPlace[];
  insets: Insets;
  refit: number;
  attach: number;
}) {
  const map = useMap();
  const key = [
    refit,
    attach,
    pin ? `${pin.lat},${pin.lng}` : "",
    stops.map((s) => `${s.lat},${s.lng}`).join("|"),
    places.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ].join("#");
  const { top, right, bottom, left } = insets;
  useEffect(() => {
    if (!map) return;
    const pts: { lat: number; lng: number }[] = pin ? [pin] : [...stops, ...places];
    if (pts.length === 0) return;
    // The map was moved into another screen: let it measure its new size before framing.
    google.maps.event.trigger(map, "resize");
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    if (pts.length === 1) {
      // One point: frame a small area around it, so the padding still shifts it clear of the panels.
      const p = pts[0];
      b.extend({ lat: p.lat + 0.012, lng: p.lng + 0.012 });
      b.extend({ lat: p.lat - 0.012, lng: p.lng - 0.012 });
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

/** When a stop is picked, centre the map on its pin and zoom in to street level. */
function PanToSelected({ stops, selectedId }: { stops: MapStop[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !selectedId) return;
    const s = stops.find((x) => String(x.id) === selectedId);
    if (!s) return;
    map.panTo({ lat: s.lat, lng: s.lng });
    if ((map.getZoom() ?? 0) < 16) map.setZoom(16);
    // Only when the pick changes, not on every re-render of the stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);
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
