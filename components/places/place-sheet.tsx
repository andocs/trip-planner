"use client";

import type { Place, PlaceTable } from "./place-list";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { STATUSES } from "@/lib/constants";
import { newId, useDeleteRow, useInsertRow, useUpdateRow } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, statusField, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

const Schema = z.object({
  name: requiredText("Name", 120),
  city: optionalText(80),
  day: optionalNumber({ min: -30, max: 365, int: true }),
  note: optionalText(500),
  status: statusField,
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function PlaceSheet({
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
