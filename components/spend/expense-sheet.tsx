"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Segmented } from "@/components/ui/segmented";
import { homeAmount, localISODate } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalText, requiredNumber, requiredText, str } from "@/lib/schemas";
import type { useSheet } from "@/lib/use-sheet";

const Schema = z.object({
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  description: requiredText("Description", 120),
  category_id: z.string().transform((v) => (v === "" ? null : v)),
  paid_by: z.string().transform((v) => (v === "" ? null : v)),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: requiredNumber("Amount").refine((v) => v !== 0, "Amount can't be zero"),
  note: optionalText(500),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
type Expense = Row<"expenses">;

export function ExpenseSheet({
  sheet,
  categories,
  travelers,
}: {
  sheet: ReturnType<typeof useSheet<Expense>>;
  categories: Row<"categories">[];
  travelers: Row<"travelers">[];
}) {
  const trip = useTrip();
  const insert = useInsertRow("expenses", "expense");
  const update = useUpdateRow("expenses", "expense");
  const remove = useDeleteRow("expenses", "expense");
  const [keepAdding, setKeepAdding] = useState(false);

  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      spent_on: r?.spent_on ?? localISODate(),
      description: r?.description ?? "",
      category_id: r?.category_id ?? "",
      paid_by: r?.paid_by ?? "",
      currency: r?.currency ?? trip.home_currency,
      amount: str(r?.amount),
      note: str(r?.note),
    });
  }, [sheet.open, sheet.row, reset, trip.home_currency]);

  const [currency, amountStr] = useWatch({ control, name: ["currency", "amount"] });
  const amount = Number(String(amountStr ?? "").replace(/,/g, ""));
  const showConversion = currency === trip.foreign_currency && amountStr && Number.isFinite(amount);

  // The pill offers the trip's two currencies, plus an old one if this expense used it.
  const currencies = [
    ...new Set([trip.home_currency, trip.foreign_currency, sheet.row?.currency].filter(Boolean)),
  ] as string[];

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      const keep = getValues();
      reset({ ...keep, description: "", amount: "", note: "" });
      setFocus("description");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit expense" : "Add expense"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      submitLabel={sheet.row ? "Save" : "Add expense"}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `“${sheet.row!.description}”`);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Amount" error={errors.amount?.message ?? errors.currency?.message}>
        {(p) => (
          <div className="space-y-2">
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Segmented
                  label="Currency"
                  value={field.value}
                  onChange={field.onChange}
                  options={currencies.map((c) => ({ value: c, label: c }))}
                  className="w-full"
                />
              )}
            />
            <Input
              {...p}
              {...register("amount")}
              inputMode="decimal"
              placeholder="0.00"
              className="text-2xl font-bold tabular-nums"
            />
            <p className="min-h-5 text-sm text-fg-muted" aria-live="polite">
              {showConversion
                ? `≈ ${formatMoney(homeAmount({ currency, amount }, trip), trip.home_currency)} at ${Number(trip.rate)}`
                : ""}
            </p>
          </div>
        )}
      </Field>
      <Field label="Description" error={errors.description?.message}>
        {(p) => <Input {...p} {...register("description")} autoComplete="off" placeholder="e.g. Pho for two" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          {(p) => (
            <Select {...p} {...register("category_id")}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Paid by">
          {(p) => (
            <Select {...p} {...register("paid_by")}>
              <option value="">Not set</option>
              {travelers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Date" error={errors.spent_on?.message}>
        {(p) => <Input {...p} type="date" {...register("spent_on")} />}
      </Field>
      <Field label="Note" error={errors.note?.message}>
        {(p) => <Textarea {...p} {...register("note")} rows={2} />}
      </Field>
    </RowSheet>
  );
}
