"use client";

import { useStays } from "./stays";
import { useTrip } from "@/components/trip-gate";
import {
  effectivePlanned,
  percentUsed,
  plannedTotal,
  remaining,
  settleUp,
  spentByCategory,
  totalSpent,
  type Settlement,
} from "@/lib/calc";
import { bySort } from "@/lib/use-sheet";
import { useRows, type Row } from "./table";

export type CategoryLine = {
  id: string | null; // null = uncategorised
  name: string;
  /** What is planned for this category: the allocation or what its flights/stays add up to, whichever is more. */
  planned: number | null;
  /** The part of `planned` that comes from flights/stays in the plan (0 for other categories). */
  itemsPlanned: number;
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
  /** Total of the plan so far: every category's planned amount, plus flights/stays that have no category to land in. */
  planned: number;
  /** Budget minus the plan: what is still unplanned (negative when the plan is over budget). */
  unplanned: number;
  plannedPercent: number;
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
  const flights = useRows("flights");
  const stays = useStays();

  const ex = expenses.data ?? [];
  const cats = categories.data ?? [];
  const people = travelers.data ?? [];
  const byCat = spentByCategory(ex, trip);
  const known = new Set(cats.map((c) => c.id));

  // Flights and stays in the plan feed the planned amount of the category with their name (Flights, Accommodation).
  const byName = (name: string) => cats.find((c) => c.name.trim().toLowerCase() === name);
  const flightPlan = plannedTotal(flights.data ?? [], (f) => f.fare);
  const stayPlan = plannedTotal(stays.data ?? [], (x) => x.total);
  const itemsByCat = new Map<string, number>();
  let loose = 0; // in the plan but with no category to count under
  for (const [cat, amount] of [
    [byName("flights"), flightPlan],
    [byName("accommodation"), stayPlan],
  ] as const) {
    if (cat) itemsByCat.set(cat.id, (itemsByCat.get(cat.id) ?? 0) + amount);
    else loose += amount;
  }

  const lines: CategoryLine[] = cats.map((c) => {
    const spent = byCat.get(c.id) ?? 0;
    const itemsPlanned = itemsByCat.get(c.id) ?? 0;
    const planned = effectivePlanned(c.planned === null ? null : Number(c.planned), itemsPlanned);
    return {
      id: c.id,
      name: c.name,
      planned,
      itemsPlanned,
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
      itemsPlanned: 0,
      spent: other,
      left: null,
      percent: null,
      category: null,
    });

  const budget = Number(trip.budget);
  const spent = totalSpent(ex, trip);
  const planned = lines.reduce((sum, l) => sum + (l.planned ?? 0), 0) + loose;
  return {
    isPending:
      expenses.isPending || categories.isPending || travelers.isPending || flights.isPending || stays.isPending,
    expenses: ex,
    categories: cats,
    travelers: people,
    lines,
    budget,
    planned,
    unplanned: budget - planned,
    plannedPercent: percentUsed(budget, planned),
    spent,
    left: remaining(budget, spent),
    percent: percentUsed(budget, spent),
    settlement: settleUp(ex, people, trip),
  };
}
