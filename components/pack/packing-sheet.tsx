"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalText, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Item = Row<"packing_items">;

const Schema = z.object({
  item: requiredText("Item", 120),
  category: optionalText(60),
  whose: optionalText(40),
  packed: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function PackingSheet({
  sheet,
  categories,
  people,
  defaults,
}: {
  sheet: ReturnType<typeof useSheet<Item>>;
  categories: string[];
  people: string[];
  defaults?: Partial<In>;
}) {
  const insert = useInsertRow("packing_items", "packing item");
  const update = useUpdateRow("packing_items", "packing item");
  const remove = useDeleteRow("packing_items", "packing item");
  const [keepAdding, setKeepAdding] = useState(true);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      item: r?.item ?? "",
      category: str(r?.category),
      whose: str(r?.whose),
      packed: r?.packed ?? false,
      ...(r ? {} : defaults),
    });
  }, [sheet.open, sheet.row, reset, defaults]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      reset({ ...getValues(), item: "", packed: false });
      setFocus("item");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit item" : "Add packing item"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.item);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Item" error={errors.item?.message}>
        {(p) => <Input {...p} {...register("item")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.category?.message}>
          {(p) => <Input {...p} {...register("category")} list="pack-cats" autoComplete="off" />}
        </Field>
        <Field label="Whose" error={errors.whose?.message}>
          {(p) => <Input {...p} {...register("whose")} list="pack-people" autoComplete="off" placeholder="Shared" />}
        </Field>
      </div>
      <datalist id="pack-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="pack-people">
        {people.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Controller
        control={control}
        name="packed"
        render={({ field }) => (
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              className="size-5 accent-[var(--teal)]"
            />
            Packed
          </label>
        )}
      />
    </RowSheet>
  );
}
