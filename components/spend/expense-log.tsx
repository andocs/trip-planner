"use client";

import { EmptyText } from "@/components/view-only-banner";
import { Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { SwipeRow } from "@/components/ui/swipe-row";
import { homeAmount } from "@/lib/calc";
import { formatDay, formatMoney } from "@/lib/format";
import type { Budget } from "@/lib/queries/budget";
import { useDeleteRow, type Row } from "@/lib/queries/table";

type Expense = Row<"expenses">;
const ALL = "__all";
const NONE = "__none";

export function ExpenseLog({
  budget,
  onEdit,
  onAdd,
}: {
  budget: Budget;
  onEdit: (e: Expense) => void;
  onAdd: () => void;
}) {
  const trip = useTrip();
  const remove = useDeleteRow("expenses", "expense");
  const [cat, setCat] = useState(ALL);
  const [payer, setPayer] = useState(ALL);

  const catName = useMemo(() => new Map(budget.categories.map((c) => [c.id, c.name])), [budget.categories]);
  const payerName = useMemo(() => new Map(budget.travelers.map((t) => [t.id, t.name])), [budget.travelers]);

  const filtered = budget.expenses.filter(
    (e) =>
      (cat === ALL || (cat === NONE ? !e.category_id || !catName.has(e.category_id) : e.category_id === cat)) &&
      (payer === ALL || (payer === NONE ? !e.paid_by || !payerName.has(e.paid_by) : e.paid_by === payer)),
  );
  const filteredTotal = filtered.reduce((s, e) => s + homeAmount(e, trip), 0);
  const isFiltered = cat !== ALL || payer !== ALL;

  // Group by day, newest first (expenses are already sorted).
  const groups: { date: string; items: Expense[]; total: number }[] = [];
  for (const e of filtered) {
    const g = groups.at(-1);
    if (g && g.date === e.spent_on) {
      g.items.push(e);
      g.total += homeAmount(e, trip);
    } else groups.push({ date: e.spent_on, items: [e], total: homeAmount(e, trip) });
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Expenses</CardTitle>
        <span className="text-sm text-fg-muted tabular-nums">
          {filtered.length} · {formatMoney(filteredTotal, trip.home_currency)}
        </span>
      </div>

      {budget.expenses.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            aria-label="Filter by category"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>All categories</option>
            {budget.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NONE}>Uncategorised</option>
          </Select>
          <Select
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            aria-label="Filter by who paid"
            className="min-h-11 text-sm"
          >
            <option value={ALL}>Anyone paid</option>
            {budget.travelers.map((t) => (
              <option key={t.id} value={t.id}>
                Paid by {t.name}
              </option>
            ))}
            <option value={NONE}>Payer not set</option>
          </Select>
        </div>
      )}

      {budget.expenses.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Receipt className="size-10 text-muted" aria-hidden />
          <p className="mt-3 font-semibold">No expenses yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            <EmptyText>Log what you spend and it&rsquo;s split for you.</EmptyText>
          </p>
          <EditOnly>
            <Button className="mt-4" onClick={onAdd}>
              Add the first expense
            </Button>
          </EditOnly>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-center text-sm text-fg-muted">
          Nothing matches these filters.{" "}
          {isFiltered && (
            <button
              type="button"
              className="font-semibold text-teal underline"
              onClick={() => {
                setCat(ALL);
                setPayer(ALL);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 lg:hidden">
          <p className="mb-1 text-xs text-fg-muted">Swipe left to delete · tap to edit</p>
          {groups.map((g) => (
            <section key={g.date} aria-label={formatDay(g.date, "EEEE d MMMM")}>
              <h3 className="sticky top-0 z-10 flex justify-between bg-surface py-2 text-xs font-bold tracking-wide text-fg-muted uppercase">
                <span>{formatDay(g.date)}</span>
                <span className="tabular-nums">{formatMoney(g.total, trip.home_currency)}</span>
              </h3>
              <ul className="space-y-1">
                {g.items.map((e) => {
                  const foreign = e.currency !== trip.home_currency;
                  const sub = [
                    e.category_id ? catName.get(e.category_id) : null,
                    e.paid_by && payerName.has(e.paid_by) ? `paid by ${payerName.get(e.paid_by)}` : "payer not set",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <SwipeRow
                      key={e.id}
                      label={`${e.description}, ${formatMoney(e.amount, e.currency)}. Edit`}
                      onOpen={() => onEdit(e)}
                      onSwipeDelete={() => remove(e, `“${e.description}”`)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.description}</span>
                        <span className="block truncate text-sm text-fg-muted">{sub}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-semibold">{formatMoney(e.amount, e.currency)}</span>
                        {foreign && (
                          <span className="block text-xs text-fg-muted">
                            ≈ {formatMoney(homeAmount(e, trip), trip.home_currency)}
                          </span>
                        )}
                      </span>
                    </SwipeRow>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {filtered.length > 0 && (
        <div className="mt-2 hidden lg:block">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] tracking-[0.1em] text-fg-muted uppercase">
                <th scope="col" className="px-3 py-2 font-bold">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Description
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Category
                </th>
                <th scope="col" className="px-3 py-2 font-bold whitespace-nowrap">
                  Paid by
                </th>
                <th scope="col" className="px-3 py-2 text-right font-bold">
                  {trip.home_currency}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const foreign = e.currency !== trip.home_currency;
                return (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3 whitespace-nowrap text-fg-muted">{formatDay(e.spent_on)}</td>
                    <td className="px-3 py-3 font-semibold">
                      <RowEdit
                        label={`${e.description}, ${formatMoney(e.amount, e.currency)}. Edit`}
                        onClick={() => onEdit(e)}
                      >
                        {e.description}
                      </RowEdit>
                    </td>
                    <td className="px-3 py-3">{(e.category_id && catName.get(e.category_id)) || "–"}</td>
                    <td className="px-3 py-3">{(e.paid_by && payerName.get(e.paid_by)) || "–"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{formatMoney(homeAmount(e, trip), trip.home_currency)}</span>
                      {foreign && (
                        <span className="block text-xs text-fg-muted">{formatMoney(e.amount, e.currency)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** A button for people who can edit; plain text for viewers. */
function RowEdit({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  const canEdit = useCanEdit();
  return canEdit ? (
    <button type="button" aria-label={label} onClick={onClick} className="min-h-11 text-left hover:underline">
      {children}
    </button>
  ) : (
    <>{children}</>
  );
}
