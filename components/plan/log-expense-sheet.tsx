"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { localISODate } from "@/lib/calc";
import { expenseDefaults, type LoggableKind } from "@/lib/log-expense";
import { bySort } from "@/lib/use-sheet";
import { newId, useInsertRow, useRows, type Row } from "@/lib/queries/table";

/**
 * Turn a booked flight or stay into an expense, once. The expense remembers which booking it paid for, so the booking
 * shows "Logged" afterwards and can't be counted twice. Everything is prefilled and editable (the amount is the fare or
 * the stay total, in the trip's home currency).
 */
export function LogExpenseSheet({
  kind,
  item,
  onClose,
}: {
  kind: LoggableKind;
  item: Row<"flights"> | Row<"stays">;
  onClose: () => void;
}) {
  const trip = useTrip();
  const categories = useRows("categories", bySort);
  const travelers = useRows("travelers", bySort);
  const insert = useInsertRow("expenses", "expense");
  const start = expenseDefaults(kind, item, categories.data ?? [], localISODate());
  const [description, setDescription] = useState(start.description);
  const [amount, setAmount] = useState(start.amount);
  const [categoryId, setCategoryId] = useState(start.category_id ?? "");
  const [paidBy, setPaidBy] = useState("");
  const [date, setDate] = useState(start.spent_on);
  const value = Number(amount.replace(/,/g, ""));
  const problem = !description.trim()
    ? "Add a description."
    : !Number.isFinite(value) || value <= 0
      ? "Enter the amount you paid."
      : null;

  const submit = () => {
    if (problem) return;
    insert.mutate([
      {
        id: newId(),
        description: description.trim().slice(0, 120),
        amount: value,
        currency: trip.home_currency,
        category_id: categoryId || null,
        paid_by: paidBy || null,
        spent_on: date,
        note: null,
        source_table: kind,
        source_id: item.id,
      },
    ]);
    toast.success("Logged as an expense.");
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Log as expense"
      description="This counts toward Spent once. The booking will show “Logged”."
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" disabled={!!problem || insert.isPending} onClick={submit}>
            Log expense
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label={`Amount (${trip.home_currency})`}
          error={amount && problem?.startsWith("Enter") ? problem : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="text-2xl font-bold tabular-nums"
            />
          )}
        </Field>
        <Field label="Description">
          {(p) => <Input {...p} value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {(p) => (
              <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Paid by">
            {(p) => (
              <Select {...p} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                <option value="">Not set</option>
                {(travelers.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Date paid">
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
      </form>
    </Sheet>
  );
}
