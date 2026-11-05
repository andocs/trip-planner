"use client";

import { useTrip } from "@/components/trip-gate";
import { percentUsed, remaining, settleUp, spentByCategory, totalSpent, type Settlement } from "@/lib/calc";
import { bySort } from "@/lib/use-sheet";
import { useRows, type Row } from "./table";

export type CategoryLine = {
  id: string | null; // null = uncategorised
  name: string;
  planned: number | null;
  spent: number;
  left: number | null;
  percent: number | null;
  category: Row<"categories"> | null;
};

export type Budget = {
  isPending: boolean;
  expenses: Row<"expenses">[];
  categories: Row<"categories">[];
  travelers: Row<"travelers">[];
  lines: CategoryLine[];
  budget: number;
  spent: number;
  left: number;
  percent: number;
  settlement: Settlement;
};

export const byNewest = (a: Row<"expenses">, b: Row<"expenses">) =>
  b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at);

/** Everything the Spend tab and the Home tiles need, derived from expenses/categories/travelers. */
export function useBudget(): Budget {
  const trip = useTrip();
  const expenses = useRows("expenses", byNewest);
  const categories = useRows("categories", bySort);
  const travelers = useRows("travelers", bySort);

  const ex = expenses.data ?? [];
  const cats = categories.data ?? [];
  const people = travelers.data ?? [];
  const byCat = spentByCategory(ex, trip);
  const known = new Set(cats.map((c) => c.id));

  const lines: CategoryLine[] = cats.map((c) => {
    const spent = byCat.get(c.id) ?? 0;
    const planned = c.planned === null ? null : Number(c.planned);
    return {
      id: c.id,
      name: c.name,
      planned,
      spent,
      left: planned === null ? null : planned - spent,
      percent: planned ? (spent / planned) * 100 : null,
      category: c,
    };
  });
  // Expenses with no category (or one that was deleted) still count toward the total.
  let other = 0;
  for (const [id, amt] of byCat) if (id === "none" || !known.has(id)) other += amt;
  if (other > 0)
    lines.push({
      id: null,
      name: "Uncategorised",
      planned: null,
      spent: other,
      left: null,
      percent: null,
      category: null,
    });

  const budget = Number(trip.budget);
  const spent = totalSpent(ex, trip);
  return {
    isPending: expenses.isPending || categories.isPending || travelers.isPending,
    expenses: ex,
    categories: cats,
    travelers: people,
    lines,
    budget,
    spent,
    left: remaining(budget, spent),
    percent: percentUsed(budget, spent),
    settlement: settleUp(ex, people, trip),
  };
}
