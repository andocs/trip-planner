"use client";

import { ChevronDown, ChevronUp, Crosshair, GripVertical, Loader2, MapPin, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Place } from "@/app/api/geocode/route";
import { Board } from "@/components/ui/board";
import { Button } from "@/components/ui/button";
import type { Pin, StepProps } from "@/components/wizard/wizard";
import { MAX_NIGHTS, totalNights } from "@/lib/wizard";
import { cn } from "@/lib/utils";

const h1 = "font-display text-[30px] leading-[1.02] font-extrabold tracking-tight lg:text-[34px]";

export function StepHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <>
      <h1 className={h1}>{title}</h1>
      {lede && <p className="mt-2 text-[15px] text-fg-muted">{lede}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ 1 Where */

const coordLabel = (p: { lat: number; lng: number }) =>
  `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? "N" : "S"} ${Math.abs(p.lng).toFixed(2)}°${p.lng >= 0 ? "E" : "W"}`;

export function StepWhere({
  d,
  set,
  go,
  saving,
  pin,
  setPin,
}: StepProps & { pin: Pin; setPin: Dispatch<SetStateAction<Pin>> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const seq = useRef(0);

  // Debounced suggestions. The server queues lookups (Nominatim: one request per second) and caches them.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}&suggest=1`);
        const body = (await res.json()) as { results?: Place[]; error?: string };
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(body.error ?? "Search failed");
        setResults(body.results ?? []);
        setSearchError(null);
      } catch {
        if (mine === seq.current) {
          setResults([]);
          setSearchError("Search isn’t responding. You can still tap the map to drop a pin.");
        }
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  function choose(p: Place) {
    setPin({ place: p, loading: false, error: null });
    setQ(p.name);
    setOpen(false);
  }

  async function addStop() {
    const p = pin.place;
    if (!p) return;
    const stops = [
      ...d.stops,
      {
        key: crypto.randomUUID(),
        name: p.name,
        country: p.country,
        countryCode: p.countryCode,
        lat: p.lat,
        lng: p.lng,
        nights: 2,
      },
    ];
    const ok = await go(2, {
      stops: stops.map((s) => ({ city: s.name, country: s.country, nights: s.nights, lat: s.lat, lng: s.lng })),
    });
    if (ok) {
      set({ stops });
      setPin({ place: null, loading: false, error: null });
      setQ("");
    }
  }

  const active = q.trim().length >= 2;
  const shown = active ? results : [];
  const showList = open && active && (shown.length > 0 || searching || searchError);
  return (
    <>
      <div className="fixed inset-x-4 top-[72px] z-20 lg:top-20 lg:right-auto lg:left-6 lg:w-[420px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-4 left-3.5 size-5 text-fg-muted" aria-hidden />
          <label htmlFor="wizard-search" className="sr-only">
            Search for a city or place
          </label>
          <input
            id="wizard-search"
            role="combobox"
            aria-expanded={!!showList}
            aria-controls={listId}
            aria-autocomplete="list"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && shown[0]) choose(shown[0]);
            }}
            placeholder="Search for a city or place"
            autoComplete="off"
            className="block min-h-[52px] w-full rounded-[14px] border-0 bg-surface pr-12 pl-11 text-base font-medium shadow-float placeholder:text-fg-muted focus:outline-3"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                setResults([]);
                setPin({ place: null, loading: false, error: null });
              }}
              className="absolute top-1 right-1 grid size-11 place-items-center rounded-full text-fg-muted"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          )}
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="mt-1.5 overflow-hidden rounded-2xl bg-surface shadow-float dark:ring-1 dark:ring-border"
          >
            {searching && shown.length === 0 && (
              <li role="presentation" className="flex min-h-14 items-center gap-3 px-3.5 text-sm text-fg-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
              </li>
            )}
            {searchError && (
              <li role="presentation" className="px-3.5 py-3 text-sm font-bold text-danger">
                {searchError}
              </li>
            )}
            {shown.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex min-h-14 w-full items-center gap-3 border-t border-border px-3.5 py-1.5 text-left first:border-t-0 hover:bg-surface-2"
                >
                  <MapPin className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <b className="block truncate">{r.name}</b>
                    <span className="block truncate text-sm text-fg-muted">{r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StepHeading
        title={d.stops.length ? "Where next?" : "Where are you going first?"}
        lede="Search, or tap the map to drop a pin. You can add more stops next."
      />

      <div className="mt-4 flex flex-col gap-3">
        {pin.loading ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3" aria-busy="true">
            <span className="grid size-10 place-items-center rounded-full bg-line text-fg-muted">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </span>
            <span className="text-sm text-fg-muted">Looking up this spot…</span>
          </div>
        ) : pin.place ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3" role="status">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[17px] font-bold">
                {[pin.place.name, pin.place.country].filter(Boolean).join(", ")}
              </div>
              <div className="font-mono text-sm text-fg-muted">{coordLabel(pin.place)}</div>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5 rounded-2xl bg-surface-2 p-3.5 text-sm text-fg-muted">
            <Crosshair className="size-5 shrink-0" aria-hidden />
            <span>Tap anywhere on the map, or search for a city above.</span>
          </div>
        )}
        {pin.error && <p className="text-sm font-bold text-danger">{pin.error}</p>}
      </div>

      {d.stops.length > 0 && (
        <p className="mt-3 text-sm text-fg-muted">
          {d.stops.length} {d.stops.length === 1 ? "stop" : "stops"} so far: {d.stops.map((s) => s.name).join(", ")}.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-5">
        <Button size="lg" className="w-full" disabled={!pin.place || pin.loading || saving} onClick={addStop}>
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Add this stop
        </Button>
        {d.stops.length > 0 && (
          <Button variant="ghost" className="w-full" onClick={() => go(2)}>
            Back to my stops
          </Button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 2 Nights */

export function StepNights({ d, set, go, saving }: StepProps) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const stops = d.stops;
  const setNights = (key: string, n: number) =>
    set({ stops: stops.map((s) => (s.key === key ? { ...s, nights: Math.min(MAX_NIGHTS, Math.max(0, n)) } : s)) });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length || from === to) return;
    const next = [...stops];
    next.splice(to, 0, next.splice(from, 1)[0]);
    set({ stops: next });
  };
  const remove = (key: string) => set({ stops: stops.filter((s) => s.key !== key) });
  const payload = () => ({
    stops: stops.map((s) => ({ city: s.name, country: s.country, nights: s.nights, lat: s.lat, lng: s.lng })),
  });

  return (
    <>
      <StepHeading title="How many nights in each?" />
      <ul className="mt-4 flex flex-col gap-2" aria-label="Stops">
        {stops.map((s, i) => (
          <li
            key={s.key}
            draggable
            onDragStart={() => setDragKey(s.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = stops.findIndex((x) => x.key === dragKey);
              move(from, i);
              setDragKey(null);
            }}
            className={cn(
              "flex min-h-16 flex-wrap items-center gap-x-1 rounded-2xl bg-surface-2 py-1.5 pr-1 pl-3 lg:flex-nowrap",
              dragKey === s.key && "opacity-50",
            )}
          >
            <GripVertical className="hidden size-5 shrink-0 cursor-grab text-fg-muted lg:block" aria-hidden />
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-ground"
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="ml-1 min-w-0 flex-1 basis-24">
              <span className="block truncate font-bold">{s.name}</span>
              <span className="block truncate text-[13px] text-fg-muted">{s.country ?? ""}</span>
            </span>
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => setNights(s.key, s.nights - 1)}
                disabled={s.nights <= 0}
                aria-label={`Fewer nights in ${s.name}`}
                className="grid size-11 place-items-center rounded-full disabled:opacity-30"
              >
                <Minus className="size-5" strokeWidth={2.6} aria-hidden />
              </button>
              <Board value={s.nights} />
              <button
                type="button"
                onClick={() => setNights(s.key, s.nights + 1)}
                disabled={s.nights >= MAX_NIGHTS}
                aria-label={`More nights in ${s.name}`}
                className="grid size-11 place-items-center rounded-full disabled:opacity-30"
              >
                <Plus className="size-5" strokeWidth={2.6} aria-hidden />
              </button>
            </span>
            <span className="flex w-full shrink-0 items-center justify-end lg:w-auto">
              <span className="flex items-center">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move ${s.name} up`}
                  className="grid size-11 place-items-center rounded-full text-fg-muted disabled:opacity-30"
                >
                  <ChevronUp className="size-5" strokeWidth={2.6} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === stops.length - 1}
                  aria-label={`Move ${s.name} down`}
                  className="-ml-2 grid size-11 place-items-center rounded-full text-fg-muted disabled:opacity-30"
                >
                  <ChevronDown className="size-5" strokeWidth={2.6} aria-hidden />
                </button>
              </span>
              {stops.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(s.key)}
                  aria-label={`Remove ${s.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3 self-start" onClick={() => go(1, payload())}>
        <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
        Add another stop on the map
      </Button>

      <div className="mt-auto pt-5">
        <div className="mb-2.5 flex items-center justify-between px-1 font-bold">
          <span className="text-fg-muted">
            {stops.length} {stops.length === 1 ? "stop" : "stops"}
          </span>
          <span>{totalNights(stops)} nights</span>
        </div>
        <Button size="lg" className="w-full" disabled={stops.length === 0 || saving} onClick={() => go(3, payload())}>
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Continue to dates
        </Button>
      </div>
    </>
  );
}
