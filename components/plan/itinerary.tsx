"use client";

import { CalendarPlus, Plus } from "lucide-react";
import { useState } from "react";
import { EditOnly } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { CheckButton } from "@/components/ui/check";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { itineraryProgress } from "@/lib/calc";
import { ITINERARY_TYPES, typeColor } from "@/lib/constants";
import { formatDay, formatDuration, formatTime } from "@/lib/format";
import { useDeleteRow, useRows, useUpdateRow } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { ItineraryItem } from "./itinerary-sheet";

const ItinerarySheet = dynamic(() => import("./itinerary-sheet").then((m) => m.ItinerarySheet), { ssr: false });

const ALL = "__all";

/** Within a day: by time (untimed last), then creation order. */
const byTime = (a: ItineraryItem, b: ItineraryItem) =>
  (a.at_time ?? "99").localeCompare(b.at_time ?? "99") || a.created_at.localeCompare(b.created_at);

type DayGroup = { key: string; day: number | null; date: string | null; cities: string[]; items: ItineraryItem[] };

function groupByDay(items: ItineraryItem[]): DayGroup[] {
  const map = new Map<string, ItineraryItem[]>();
  for (const it of items) {
    const key = it.day === null ? (it.on_date ? `d:${it.on_date}` : "none") : `n:${it.day}`;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  const groups = [...map.entries()].map(([key, list]) => {
    const sorted = list.sort(byTime);
    const dates = sorted.map((i) => i.on_date).filter(Boolean) as string[];
    const date =
      dates.sort((a, b) => dates.filter((d) => d === b).length - dates.filter((d) => d === a).length)[0] ?? null;
    const cities = [...new Set(sorted.map((i) => i.city).filter(Boolean) as string[])];
    return { key, day: sorted[0].day, date, cities, items: sorted };
  });
  return groups.sort((a, b) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    return (a.day ?? Infinity) - (b.day ?? Infinity) || (a.date ?? "").localeCompare(b.date ?? "");
  });
}

export function TypeTag({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
      <span className="size-2 rounded-full" style={{ background: typeColor(type) }} aria-hidden />
      {type}
    </span>
  );
}

export function Itinerary() {
  const { data: items = [], isPending } = useRows("itinerary_items");
  const update = useUpdateRow("itinerary_items", "activity");
  const remove = useDeleteRow("itinerary_items", "activity");
  const sheet = useSheet<ItineraryItem>();
  const [defaults, setDefaults] = useState<{ day?: string; on_date?: string; city?: string }>();
  const [city, setCity] = useState(ALL);
  const [type, setType] = useState(ALL);

  if (isPending) return <Skeleton className="h-96" />;

  const cities = [...new Set(items.map((i) => i.city).filter(Boolean) as string[])].sort();
  const filtered = items.filter((i) => (city === ALL || i.city === city) && (type === ALL || i.type === type));
  const groups = groupByDay(filtered);
  const all = itineraryProgress(items);

  const addTo = (g?: DayGroup) => {
    setDefaults(
      g ? { day: g.day === null ? "" : String(g.day), on_date: g.date ?? "", city: g.cities.at(-1) ?? "" } : undefined,
    );
    sheet.openAdd();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {all.total ? `${all.done} of ${all.total} done` : "Nothing planned yet"}
        </p>
        <EditOnly>
          <Button size="sm" variant="secondary" onClick={() => addTo()}>
            <CalendarPlus className="size-4" aria-hidden />
            Add
          </Button>
        </EditOnly>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Filter by city"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>All types</option>
            {ITINERARY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">Plan your days</p>
          <p className="mt-1 text-sm text-fg-muted">
            Add activities with a date and time; they&rsquo;re grouped by day.
          </p>
          <EditOnly>
            <Button className="mt-4" onClick={() => addTo()}>
              Add the first activity
            </Button>
          </EditOnly>
        </div>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">Nothing matches these filters.</p>
      ) : (
        groups.map((g) => {
          const p = itineraryProgress(g.items);
          const title = [
            g.day !== null ? `Day ${g.day}` : g.key === "none" ? "Unscheduled" : null,
            g.date ? formatDay(g.date) : null,
            g.cities.slice(0, 2).join(" · ") || null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <section key={g.key} aria-label={title} className="rounded-2xl border border-border bg-surface shadow-card">
              <header className="sticky top-0 z-10 flex items-center gap-2 rounded-t-2xl border-b border-border bg-surface/95 py-1 pr-1 pl-4 backdrop-blur">
                <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h2>
                <span className="text-xs text-fg-muted tabular-nums">
                  {p.done}/{p.total}
                </span>
                <EditOnly>
                  <Button variant="ghost" size="icon" onClick={() => addTo(g)} aria-label={`Add to ${title}`}>
                    <Plus className="size-5" aria-hidden />
                  </Button>
                </EditOnly>
              </header>
              <ul className="p-2">
                {g.items.map((it) => (
                  <SwipeRow
                    key={it.id}
                    label={`${formatTime(it.at_time)} ${it.activity}. Edit`}
                    onOpen={() => sheet.openEdit(it)}
                    onSwipeDelete={() => remove(it, `“${it.activity}”`)}
                    leading={
                      <CheckButton
                        checked={it.done}
                        onChange={(done) => update.mutate({ id: it.id, patch: { done } })}
                        label={`Done: ${it.activity}`}
                        className="ml-1"
                      />
                    }
                  >
                    <span className="w-11 shrink-0 text-sm font-semibold text-fg-muted tabular-nums">
                      {formatTime(it.at_time) || "–"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block font-semibold", it.done && "text-fg-muted line-through")}>
                        {it.activity}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2">
                        <TypeTag type={it.type} />
                        {it.duration_min ? (
                          <span className="text-xs text-fg-muted">{formatDuration(it.duration_min)}</span>
                        ) : null}
                        {it.note && <span className="truncate text-xs text-fg-muted">{it.note}</span>}
                      </span>
                    </span>
                  </SwipeRow>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {sheet.mounted && <ItinerarySheet sheet={sheet} cities={cities} defaults={defaults} />}
    </div>
  );
}
