"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { STATUSES } from "@/lib/constants";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, statusField, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

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

const Schema = z.object({
  name: requiredText("Name", 120),
  city: optionalText(80),
  day: optionalNumber({ min: -30, max: 365, int: true }),
  note: optionalText(500),
  status: statusField,
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

function PlaceSheet({
  table,
  noun,
  sheet,
  cities,
  onRenamed,
}: {
  table: PlaceTable;
  noun: string;
  sheet: ReturnType<typeof useSheet<Place>>;
  cities: string[];
  onRenamed?: (from: string, to: string) => void;
}) {
  const insert = useInsertRow(table, noun);
  const update = useUpdateRow(table, noun);
  const remove = useDeleteRow(table, noun);
  const [keepAdding, setKeepAdding] = useState(false);
  const { register, handleSubmit, reset, formState, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;
  const listId = `${table}-cities`;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      name: r?.name ?? "",
      city: str(r?.city),
      day: str(r?.day),
      note: str(r?.note),
      status: (r?.status as In["status"]) ?? "Planned",
    });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      if (v.name !== sheet.row.name) onRenamed?.(sheet.row.name, v.name);
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      reset({ ...getValues(), name: "", note: "" });
      setFocus("name");
    } else sheet.close();
  });

  const title = `${sheet.row ? "Edit" : "Add"} ${noun}`;
  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={title.charAt(0).toUpperCase() + title.slice(1)}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.name);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Name" error={errors.name?.message}>
        {(p) => <Input {...p} {...register("name")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors.city?.message}>
          {(p) => <Input {...p} {...register("city")} list={listId} autoComplete="off" />}
        </Field>
        <Field label="Day" error={errors.day?.message}>
          {(p) => <Input {...p} {...register("day")} type="number" inputMode="numeric" step={1} />}
        </Field>
      </div>
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Status">
        {(p) => (
          <Select {...p} {...register("status")}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Note" error={errors.note?.message}>
        {(p) => <Textarea {...p} {...register("note")} rows={2} placeholder="e.g. Bib Gourmand, closes at 2pm" />}
      </Field>
    </RowSheet>
  );
}
