"use client";

import { Gauge, Info, MapPinOff, RefreshCw, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { openAddIdea } from "@/components/board/capture-host";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useMedia } from "@/lib/use-media";
import { KIND_LABEL, type PlaceCard as Place, type PlaceKind } from "@/lib/places/types";
import {
  PlacesClientError,
  purgeStaleCoords,
  searchKey,
  useCities,
  usePlaceRefs,
  useSuggestions,
} from "@/lib/queries/places";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CompactPlaceCard, PlaceCard } from "./place-card";
import type { MapPlace } from "@/components/map/map-view";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});
const PlaceSheet = dynamic(() => import("./place-sheet").then((m) => m.PlaceSheet), { ssr: false });
const SavePlaceModal = dynamic(() => import("./save-place-modal").then((m) => m.SavePlaceModal), { ssr: false });

const KINDS: PlaceKind[] = ["sight", "food", "stay"];

/** Google returns up to 20 places in one search; the list reveals them five at a time, with no further Google call. */
const PAGE = 5;

/**
 * Discover (owner only): suggestions from Google Maps for a city, as cards and as pins on the Google map. Nothing here
 * is stored: results live in this tab's memory, and a place only reaches the board when the owner saves it.
 */
export function Discover() {
  const cities = useCities();
  const refs = usePlaceRefs();
  const qc = useQueryClient();
  const wide = useMedia("(min-width: 1024px)");
  const [cityName, setCityName] = useState("");
  const [kind, setKind] = useState<PlaceKind>("sight");
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Place | null>(null);
  const [saving, setSaving] = useState<Place | null>(null);
  const selectedEl = useRef<HTMLElement | null>(null);

  useEffect(() => purgeStaleCoords(), []);

  const city = cities.find((c) => c.name === cityName) ?? cities[0];
  const q = useSuggestions(kind, city);
  const places = useMemo(() => q.data ?? [], [q.data]);
  const visible = places.slice(0, shown);
  const select = (id: string) => {
    setSelectedId(id);
    const i = places.findIndex((p) => p.id === id);
    if (i >= shown) setShown(Math.ceil((i + 1) / PAGE) * PAGE);
  };
  const showMap = wide || view === "map";
  const showList = wide || view === "list";

  const mapPlaces: MapPlace[] = places.map((p, i) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    n: i + 1,
    state: p.id === selectedId ? "selected" : refs.byPlace.has(p.id) ? "saved" : "suggestion",
  }));

  useEffect(() => {
    if (selectedId && showList)
      selectedEl.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  }, [selectedId, showList]);

  if (cities.length === 0)
    return (
      <Card className="flex flex-col items-center gap-3 px-5 py-9 text-center">
        <MapPinOff className="size-10 text-fg-muted" strokeWidth={1.8} aria-hidden />
        <h2 className="font-display text-2xl font-extrabold tracking-tight">No city to search yet</h2>
        <p className="max-w-[40ch] text-fg-muted">
          Suggestions work from your destinations. Add one with a map location in Settings, then come back.
        </p>
      </Card>
    );

  const err = q.error instanceof PlacesClientError ? q.error : q.error ? new PlacesClientError("unavailable") : null;
  const selected = places.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <label className="lg:w-60">
          <span className="sr-only">City</span>
          <Select
            value={city?.name ?? ""}
            onChange={(e) => (setCityName(e.target.value), setSelectedId(null), setShown(PAGE))}
            className="font-bold"
          >
            {cities.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </Select>
        </label>
        <div role="group" aria-label="Type" className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => (setKind(k), setSelectedId(null), setShown(PAGE))}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold",
                kind === k ? "bg-ink text-ground" : "bg-surface text-fg ring-[1.5px] ring-line-strong",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <Segmented<"list" | "map">
          label="View"
          value={view}
          onChange={setView}
          className="flex w-full lg:hidden"
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
        />
      </div>

      <p className="flex items-center gap-2 text-[13px] text-fg-muted">
        <Info className="size-4 shrink-0" strokeWidth={2.4} aria-hidden />
        <span>
          Suggestions from <b className="text-fg">Google Maps</b>. They are not on your board until you save them.
        </span>
        {q.isSuccess && (
          <button
            type="button"
            onClick={() => (setShown(PAGE), void qc.resetQueries({ queryKey: searchKey(kind, city!) }))}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 font-bold text-teal"
            title="Uses one of this month's free Google searches"
          >
            <RefreshCw className="size-4" strokeWidth={2.4} aria-hidden />
            Search again
          </button>
        )}
      </p>

      {err ? (
        <Notice code={err.code} message={err.message} onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
          {showList && (
            <div className="space-y-3">
              {q.isPending ? (
                [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-[20px]" />)
              ) : places.length === 0 ? (
                <Card className="px-5 py-8 text-center text-fg-muted">
                  Nothing found here. Try another type or city.
                </Card>
              ) : (
                <>
                  {visible.map((p) => (
                    <PlaceCard
                      key={p.id}
                      card={p}
                      kind={kind}
                      saved={refs.byPlace.has(p.id)}
                      selected={p.id === selectedId}
                      onSelectedRef={(el) => (selectedEl.current = el)}
                      onOpen={() => (setSelectedId(p.id), setOpen(p))}
                      onSave={() => setSaving(p)}
                    />
                  ))}
                  {places.length > shown && (
                    <Button variant="secondary" size="lg" className="w-full" onClick={() => setShown(shown + PAGE)}>
                      Show {Math.min(PAGE, places.length - shown)} more
                      <span className="font-normal text-fg-muted">
                        {shown} of {places.length}
                      </span>
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {showMap && (
            <div
              className={cn(
                "relative h-[34rem] overflow-hidden rounded-[20px] bg-[var(--sea)] shadow-card",
                wide && "sticky top-4 h-[42rem] self-start",
              )}
            >
              <MapView
                stops={[]}
                places={mapPlaces}
                onPlaceClick={select}
                insets={{ top: 56, right: 56, bottom: selected && !wide ? 190 : 40, left: 32 }}
                label="Suggested places"
              />
              {selected && !wide && (
                <div className="absolute inset-x-3 bottom-9 z-10">
                  <CompactPlaceCard
                    card={selected}
                    kind={kind}
                    saved={refs.byPlace.has(selected.id)}
                    selected={false}
                    onOpen={() => setOpen(selected)}
                    onSave={() => setSaving(selected)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && (
        <PlaceSheet
          card={open}
          kind={kind}
          saved={refs.byPlace.has(open.id)}
          onClose={() => setOpen(null)}
          onSave={() => (setSaving(open), setOpen(null))}
        />
      )}
      {saving && city && (
        <SavePlaceModal
          card={saving}
          kind={kind}
          cities={cities.map((c) => c.name)}
          city={city.name}
          onClose={() => setSaving(null)}
        />
      )}
    </div>
  );
}

/** A failure is always one of a few fixed notices, each with a way forward (never Google's own message). */
function Notice({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  const limit = code === "cap";
  const Icon = limit ? Gauge : WifiOff;
  return (
    <div
      role={limit ? "status" : "alert"}
      className="flex gap-3 rounded-2xl bg-surface-2 p-4 ring-[1.5px] ring-line-strong"
    >
      <Icon
        className={cn("mt-0.5 size-[22px] shrink-0", limit ? "text-warn-text" : "text-danger")}
        strokeWidth={2.2}
        aria-hidden
      />
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-extrabold tracking-tight">
          {limit
            ? "Suggestions are paused for this month"
            : code === "not_configured"
              ? "Suggestions aren’t set up yet"
              : code === "rate"
                ? "Slow down a moment"
                : "Couldn’t reach Google Maps"}
        </h2>
        <p className="mt-1 max-w-[60ch] text-[15px] text-fg-muted">
          {limit
            ? "This month’s free Google Maps allowance is nearly used up, so new searches are off to avoid charges. Everything you saved still works."
            : code === "not_configured"
              ? "A Google Maps key hasn’t been added to this deployment yet. Everything else works."
              : code === "rate"
                ? message
                : "Your board and itinerary are fine. Check your connection and try again."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!limit && code !== "not_configured" && (
            <Button size="sm" onClick={onRetry}>
              <RefreshCw className="size-[18px]" strokeWidth={2.4} aria-hidden />
              Try again
            </Button>
          )}
          <Button size="sm" variant={limit ? "primary" : "outline"} onClick={() => openAddIdea()}>
            Add an idea by hand
          </Button>
        </div>
      </div>
    </div>
  );
}
