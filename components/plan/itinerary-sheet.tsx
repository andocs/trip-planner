"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { dayNumberFor } from "@/lib/calc";
import { ITINERARY_TYPES } from "@/lib/constants";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalDate, optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import type { useSheet } from "@/lib/use-sheet";

const Schema = z.object({
  on_date: optionalDate,
  day: optionalNumber({ min: -30, max: 365, int: true }),
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
  /** Prefill for "add" (e.g. the day you tapped + on). */
  defaults?: Partial<In>;
}) {
  const trip = useTrip();
  const insert = useInsertRow("itinerary_items", "activity");
  const update = useUpdateRow("itinerary_items", "activity");
  const remove = useDeleteRow("itinerary_items", "activity");
  const [keepAdding, setKeepAdding] = useState(false);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      on_date: str(r?.on_date),
      day: str(r?.day),
      at_time: r?.at_time?.slice(0, 5) ?? "",
      city: str(r?.city),
      activity: r?.activity ?? "",
      type: r?.type ?? "",
      duration_min: str(r?.duration_min),
      note: str(r?.note),
      done: r?.done ?? false,
      ...(r ? {} : defaults),
    });
  }, [sheet.open, sheet.row, reset, defaults]);

  const [onDate, day] = useWatch({ control, name: ["on_date", "day"] });
  const autoDay = !day && onDate && trip.start_date ? dayNumberFor(onDate, trip.start_date) : null;

  const onSubmit = handleSubmit((v) => {
    // Blank day + a date → fill the day from the trip start (start date = Day 1).
    const values = {
      ...v,
      day: v.day ?? (v.on_date && trip.start_date ? dayNumberFor(v.on_date, trip.start_date) : null),
    };
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: values });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...values }]);
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
        <Field label="Date" error={errors.on_date?.message}>
          {(p) => <Input {...p} type="date" {...register("on_date")} />}
        </Field>
        <Field label="Time" error={errors.at_time?.message}>
          {(p) => <Input {...p} type="time" {...register("at_time")} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Day"
          error={errors.day?.message}
          hint={autoDay !== null ? `Leave blank for Day ${autoDay}` : "Filled from the date if blank"}
        >
          {(p) => <Input {...p} {...register("day")} type="number" inputMode="numeric" step={1} />}
        </Field>
        <Field label="Duration (min)" error={errors.duration_min?.message}>
          {(p) => <Input {...p} {...register("duration_min")} type="number" inputMode="numeric" min={0} step={5} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors.city?.message}>
          {(p) => <Input {...p} {...register("city")} list="itin-cities" autoComplete="off" />}
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
