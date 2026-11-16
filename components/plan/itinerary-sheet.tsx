"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { tripLength } from "@/lib/calc";
import { ITINERARY_TYPES } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { dateForDay, type InsertPlan } from "@/lib/itinerary";
import { placeAtEndOfDay, useMoveItems } from "@/lib/queries/itinerary";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import type { useSheet } from "@/lib/use-sheet";

const Schema = z.object({
  /** The day of the trip. The date is worked out from the trip start, so it is never asked for. */
  day: z.string(),
  at_time: z
    .string()
    .refine((v) => v === "" || /^\d{2}:\d{2}/.test(v), "Pick a time")
    .transform((v) => (v === "" ? null : v.slice(0, 5))),
  city: optionalText(80),
  activity: requiredText("Activity", 200),
  type: z.string().transform((v) => (v === "" ? null : v)),
  duration_min: optionalNumber({ min: 0, max: 24 * 60 * 7, int: true }),
  note: optionalText(500),
  done: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
export type ItineraryItem = Row<"itinerary_items">;

export function ItinerarySheet({
  sheet,
  cities,
  defaults,
}: {
  sheet: ReturnType<typeof useSheet<ItineraryItem>>;
  cities: string[];
  /** Prefill for "add": the day you tapped + on, and where in that day (right after a place) the new activity goes. */
  defaults?: Partial<Pick<In, "day">> & { plan?: InsertPlan };
}) {
  const trip = useTrip();
  const all = useRows("itinerary_items").data ?? [];
  const move = useMoveItems();
  // The spot is used once; with "Keep adding" the next ones go to the end of the day.
  const [usedPlan, setUsedPlan] = useState<InsertPlan | null>(null);
  const insert = useInsertRow("itinerary_items", "activity");
  const update = useUpdateRow("itinerary_items", "activity");
  const remove = useDeleteRow("itinerary_items", "activity");
  const [keepAdding, setKeepAdding] = useState(false);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  // Every day of the trip, and any day an item already uses (the trip may have been shortened).
  const len = tripLength(trip.start_date, trip.end_date) ?? 0;
  const days = new Set<number>();
  for (let d = 1; d <= len; d++) days.add(d);
  for (const i of all) if (i.day !== null) days.add(i.day);
  const dayList = [...days].sort((a, b) => a - b);

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      day: r ? str(r.day) : (defaults?.day ?? ""),
      at_time: r?.at_time?.slice(0, 5) ?? "",
      city: str(r?.city),
      activity: r?.activity ?? "",
      type: r?.type ?? "",
      duration_min: str(r?.duration_min),
      note: str(r?.note),
      done: r?.done ?? false,
    });
  }, [sheet.open, sheet.row, reset, defaults]);

  const onSubmit = handleSubmit((v) => {
    const { day: dayStr, ...fields } = v;
    const day = dayStr === "" ? null : Number(dayStr);
    if (sheet.row) {
      const moved = day !== sheet.row.day;
      // Changing the day sends it to the end of the new day; otherwise its place in the day is kept.
      const patch = moved
        ? { ...fields, ...placeAtEndOfDay(all.filter((i) => i.id !== sheet.row!.id), day, trip.start_date) }
        : { ...fields, on_date: dateForDay(trip.start_date, day) ?? sheet.row.on_date };
      update.mutate({ id: sheet.row.id, patch });
      sheet.close();
      return;
    }
    const spot = defaults?.plan && defaults.plan !== usedPlan && String(day ?? "") === (defaults.day ?? "") ? defaults.plan : null;
    if (spot?.renumber.length) move.mutate(spot.renumber);
    insert.mutate([
      { id: newId(), ...fields, ...(spot ? { day, on_date: dateForDay(trip.start_date, day), position: spot.position } : placeAtEndOfDay(all, day, trip.start_date)) },
    ]);
    if (spot) setUsedPlan(spot);
    if (keepAdding) {
      const keep = getValues();
      reset({ ...keep, activity: "", at_time: "", duration_min: "", note: "", done: false });
      setFocus("activity");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit activity" : "Add activity"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `“${sheet.row!.activity}”`);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Activity" error={errors.activity?.message}>
        {(p) => <Input {...p} {...register("activity")} autoComplete="off" placeholder="e.g. Train Street coffee" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" hint={trip.start_date ? "The date follows from the trip start." : undefined}>
          {(p) => (
            <Select {...p} {...register("day")}>
              <option value="">Unscheduled</option>
              {dayList.map((d) => {
                const date = dateForDay(trip.start_date, d);
                return (
                  <option key={d} value={d}>
                    {`Day ${d}${date ? ` · ${formatDay(date)}` : ""}`}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>
        <Field label="Time (optional)" error={errors.at_time?.message}>
          {(p) => <Input {...p} type="time" {...register("at_time")} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (min)" error={errors.duration_min?.message}>
          {(p) => <Input {...p} {...register("duration_min")} type="number" inputMode="numeric" min={0} step={5} />}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} {...register("type")}>
              <option value="">None</option>
              {ITINERARY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="City" error={errors.city?.message}>
        {(p) => <Input {...p} {...register("city")} list="itin-cities" autoComplete="off" />}
      </Field>
      <datalist id="itin-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Note" error={errors.note?.message}>
        {(p) => <Textarea {...p} {...register("note")} rows={2} />}
      </Field>
      <Controller
        control={control}
        name="done"
        render={({ field }) => (
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              className="size-5 accent-[var(--teal)]"
            />
            Done
          </label>
        )}
      />
    </RowSheet>
  );
}
