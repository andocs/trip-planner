"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { requiredText } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Reminder = Row<"reminders">;

const Schema = z.object({ text: requiredText("Reminder", 500) });
type Values = z.infer<typeof Schema>;

export function ReminderSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Reminder>> }) {
  const insert = useInsertRow("reminders", "reminder");
  const update = useUpdateRow("reminders", "reminder");
  const remove = useDeleteRow("reminders", "reminder");
  const { register, handleSubmit, reset, formState } = useForm<Values>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    if (sheet.open) reset({ text: sheet.row?.text ?? "" });
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
      title={sheet.row ? "Edit reminder" : "Add reminder"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, "the reminder");
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Reminder" error={formState.errors.text?.message}>
        {(p) => <Textarea {...p} {...register("text")} rows={3} />}
      </Field>
    </RowSheet>
  );
}
