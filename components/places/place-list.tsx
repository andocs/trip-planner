"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { STATUSES } from "@/lib/constants";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const PlaceSheet = dynamic(() => import("./place-sheet").then((m) => m.PlaceSheet), { ssr: false });

export type PlaceTable = "food_places" | "attractions";
export type Place = Row<"food_places"> | Row<"attractions">;

const ALL = "__all";
const byDayThenName = (a: Place, b: Place) => (a.day ?? Infinity) - (b.day ?? Infinity) || a.name.localeCompare(b.name);

/**
 * Food places and attractions share one list: status chip, city, day, note, filters.
 * `renderPanel` adds an expandable panel under a row (the food menu).
 */
export function PlaceList({
  table,
  noun,
  emptyHint,
  renderPanel,
  panelLabel,
  onRenamed,
}: {
  table: PlaceTable;
  noun: string;
  emptyHint: string;
  renderPanel?: (place: Place) => ReactNode;
  panelLabel?: (place: Place) => string;
  onRenamed?: (from: string, to: string) => void;
}) {
  const { data: places = [], isPending } = useRows(table, byDayThenName);
  const update = useUpdateRow(table, noun);
  const remove = useDeleteRow(table, noun);
  const sheet = useSheet<Place>();
  const [city, setCity] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);

  if (isPending) return <Skeleton className="h-64" />;

  const cities = [...new Set(places.map((p) => p.city).filter(Boolean) as string[])].sort();
  const shown = places.filter((p) => (city === ALL || p.city === city) && (status === ALL || p.status === status));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          {shown.length === places.length ? places.length : `${shown.length} of ${places.length}`} {noun}s
        </p>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {places.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Filter by city"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>Any status</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
      )}
      {places.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-fg-muted">{emptyHint}</p>
          <Button className="mt-3" onClick={sheet.openAdd}>
            Add a {noun}
          </Button>
        </Card>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">Nothing matches these filters.</p>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-border">
            {shown.map((p) => {
              const expanded = open === p.id;
              const panelId = `panel-${p.id}`;
              return (
                <SwipeRow
                  key={p.id}
                  label={`${p.name}. Edit`}
                  onOpen={() => sheet.openEdit(p)}
                  onSwipeDelete={() => remove(p, p.name)}
                  trailing={
                    <>
                      <StatusChip
                        status={p.status}
                        label={p.name}
                        onChange={(s) => update.mutate({ id: p.id, patch: { status: s } })}
                      />
                      {renderPanel && (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          aria-label={panelLabel?.(p) ?? `Details for ${p.name}`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setOpen(expanded ? null : p.id)}
                          className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
                        >
                          <ChevronDown
                            className={cn("size-5 transition-transform", expanded && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                      )}
                    </>
                  }
                  below={
                    renderPanel && expanded ? (
                      <div id={panelId} className="mx-1 mb-2 rounded-xl bg-surface-2 p-3">
                        {renderPanel(p)}
                      </div>
                    ) : null
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn("block font-semibold", p.status === "Cancelled" && "text-fg-muted line-through")}
                    >
                      {p.name}
                    </span>
                    <span className="block truncate text-sm text-fg-muted">
                      {[p.city, p.day !== null ? `Day ${p.day}` : null, p.note].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                </SwipeRow>
              );
            })}
          </ul>
        </Card>
      )}
      <PlaceSheet table={table} noun={noun} sheet={sheet} cities={cities} onRenamed={onRenamed} />
    </div>
  );
}
