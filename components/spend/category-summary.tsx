"use client";

import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { CategorySheet, MAX_CATEGORIES } from "@/components/settings/categories-section";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Budget } from "@/lib/queries/budget";
import type { Row } from "@/lib/queries/table";
import { nextSort, useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

export function BudgetTiles({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const cur = trip.home_currency;
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Budget" amount={budget.budget} currency={cur} />
        <Stat label="Spent" amount={budget.spent} currency={cur} />
        <Stat
          label={budget.left < 0 ? "Over" : "Left"}
          amount={Math.abs(budget.left)}
          currency={cur}
          className={budget.left < 0 ? "text-danger" : undefined}
        />
      </div>
      <Progress value={budget.percent} tone="budget" label="Budget used" />
      <p className="text-center text-sm text-fg-muted">
        {budget.budget > 0 ? `${formatPercent(budget.percent)} of budget used` : "Set a total budget in Settings"}
      </p>
    </Card>
  );
}

/** Currency code on its own line so large amounts fit three-across on a 390px phone. */
function Stat({
  label,
  amount,
  currency,
  className,
}: {
  label: string;
  amount: number;
  currency: string;
  className?: string;
}) {
  const [code, ...num] = formatMoney(amount, currency).split(" ");
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{label}</p>
      <p className={cn("mt-1 font-bold tabular-nums", className)}>
        <span className="block text-xs font-semibold text-fg-muted">{code}</span>
        <span className="block text-sm break-all sm:text-base">{num.join(" ")}</span>
      </p>
    </div>
  );
}

export function CategorySummary({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const sheet = useSheet<Row<"categories">>();
  const cur = trip.home_currency;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Categories</CardTitle>
        {budget.categories.length < MAX_CATEGORIES && (
          <EditOnly>
            <Button variant="ghost" size="sm" onClick={sheet.openAdd}>
              Add
            </Button>
          </EditOnly>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {budget.lines.map((l) => {
          const over = l.left !== null && l.left < 0;
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{l.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(l.spent, cur)}</span>
              </div>
              {l.planned !== null ? (
                <>
                  <Progress value={l.percent ?? 0} tone="budget" label={`${l.name} budget used`} className="my-1.5" />
                  <div className="flex justify-between text-xs text-fg-muted tabular-nums">
                    <span>
                      {formatPercent(l.percent ?? 0)} of {formatMoney(l.planned, cur)}
                    </span>
                    <span className={over ? "font-semibold text-danger" : undefined}>
                      {over ? `${formatMoney(-l.left!, cur)} over` : `${formatMoney(l.left, cur)} left`}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-fg-muted">
                  {l.category ? "No planned amount" : "Expenses without a category"}
                </p>
              )}
            </>
          );
          return (
            <li key={l.id ?? "none"}>
              {l.category && canEdit ? (
                <button
                  type="button"
                  onClick={() => sheet.openEdit(l.category!)}
                  aria-label={`Edit ${l.name}`}
                  className="block w-full rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  {body}
                </button>
              ) : (
                <div className="px-1 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {sheet.mounted && <CategorySheet sheet={sheet} sort={nextSort(budget.categories)} />}
    </Card>
  );
}
