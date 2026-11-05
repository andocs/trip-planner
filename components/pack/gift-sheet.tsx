"use client";

import { zodResolver } from "@hookform/resolvers/zod";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type GiftRow = Row<"gifts">;

const Schema = z.object({
  for_whom: requiredText("For whom", 120),
  gift: requiredText("Gift", 300),
  budget: optionalNumber({ min: 0 }),
  bought: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function GiftSheet({ sheet }: { sheet: ReturnType<typeof useSheet<GiftRow>> }) {
  const trip = useTrip();
  const insert = useInsertRow("gifts", "gift");
  const update = useUpdateRow("gifts", "gift");
  const remove = useDeleteRow("gifts", "gift");
  const { register, handleSubmit, reset, formState, control } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({ for_whom: r?.for_whom ?? "", gift: r?.gift ?? "", budget: str(r?.budget), bought: r?.bought ?? false });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit gift" : "Add gift"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `gift for ${sheet.row!.for_whom}`);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="For whom" error={errors.for_whom?.message}>
        {(p) => <Input {...p} {...register("for_whom")} autoComplete="off" placeholder="e.g. Mama and Ate Pup" />}
      </Field>
      <Field label="Gift idea" error={errors.gift?.message}>
        {(p) => <Textarea {...p} {...register("gift")} rows={2} placeholder="e.g. Vietnamese coffee beans" />}
      </Field>
      <Field label={`Budget (${trip.home_currency})`} error={errors.budget?.message}>
        {(p) => <Input {...p} {...register("budget")} inputMode="decimal" />}
      </Field>
      <Controller
        control={control}
        name="bought"
        render={({ field }) => (
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
            Bought
          </label>
        )}
      />
    </RowSheet>
  );
}
