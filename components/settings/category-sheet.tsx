"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Category = Row<"categories">;

const Schema = z.object({ name: requiredText("Name", 40), planned: optionalNumber({ min: 0 }) });
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
/** Edit a category's name and planned amount. Also used from the Spend tab. */
export function CategorySheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Category>>; sort: number }) {
  const trip = useTrip();
  const insert = useInsertRow("categories", "category");
  const update = useUpdateRow("categories", "category");
  const remove = useDeleteRow("categories", "category");
  const { register, handleSubmit, reset, formState } = useForm<In, unknown, Out>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    if (sheet.open) reset({ name: sheet.row?.name ?? "", planned: str(sheet.row?.planned) });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v, sort }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit category" : "Add category"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.name);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Name" error={formState.errors.name?.message}>
        {(p) => <Input {...p} {...register("name")} autoComplete="off" />}
      </Field>
      <Field
        label={`Planned (${trip.home_currency})`}
        error={formState.errors.planned?.message}
        hint="Leave blank if you haven't planned this one."
      >
        {(p) => <Input {...p} {...register("planned")} inputMode="decimal" placeholder="0.00" />}
      </Field>
    </RowSheet>
  );
}
