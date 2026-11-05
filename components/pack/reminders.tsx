"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { requiredText } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Reminder = Row<"reminders">;

export function Reminders() {
  const { data: reminders = [], isPending } = useRows("reminders");
  const insert = useInsertRow("reminders", "reminder");
  const remove = useDeleteRow("reminders", "reminder");
  const sheet = useSheet<Reminder>();
  const [draft, setDraft] = useState("");

  // Quick add straight from the list: type and press enter.
  function quickAdd(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    insert.mutate([{ id: newId(), text: text.slice(0, 500) }]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <form onSubmit={quickAdd} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a reminder…"
          aria-label="New reminder"
          maxLength={500}
        />
        <Button type="submit" size="icon" aria-label="Add reminder" disabled={!draft.trim()}>
          <Plus className="size-5" aria-hidden />
        </Button>
      </form>
      {isPending ? (
        <Skeleton className="h-32" />
      ) : reminders.length === 0 ? (
        <Card className="text-center">
          <BellRing className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-2 text-sm text-fg-muted">
            Notes to self: visas, insurance, &ldquo;bring the adapter&rdquo;…
          </p>
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-border">
            {reminders.map((r) => (
              <SwipeRow
                key={r.id}
                label={`${r.text}. Edit`}
                onOpen={() => sheet.openEdit(r)}
                onSwipeDelete={() => remove(r, "the reminder")}
              >
                <BellRing className="size-4 shrink-0 text-gold" aria-hidden />
                <span className="min-w-0 flex-1 text-sm">{r.text}</span>
              </SwipeRow>
            ))}
          </ul>
        </Card>
      )}
      <ReminderSheet sheet={sheet} />
    </div>
  );
}

const Schema = z.object({ text: requiredText("Reminder", 500) });
type Values = z.infer<typeof Schema>;

function ReminderSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Reminder>> }) {
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
