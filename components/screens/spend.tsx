"use client";

import { useState } from "react";
import { BudgetTiles, CategorySummary } from "@/components/spend/category-summary";
import { ExpenseLog } from "@/components/spend/expense-log";
import dynamic from "next/dynamic";
import { SettleUp } from "@/components/spend/settle-up";
import { PageSkeleton, TripGate } from "@/components/trip-gate";
import { Fab } from "@/components/ui/fab";
import { Segmented } from "@/components/ui/segmented";
import { useBudget } from "@/lib/queries/budget";
import type { Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

const ExpenseSheet = dynamic(() => import("@/components/spend/expense-sheet").then((m) => m.ExpenseSheet), {
  ssr: false,
});

type View = "log" | "categories" | "settle";

function Spend() {
  const budget = useBudget();
  const sheet = useSheet<Row<"expenses">>();
  const [view, setView] = useState<View>("log");

  if (budget.isPending) return <PageSkeleton />;

  // On phones one panel shows at a time; from lg up, the log sits beside categories + settle-up.
  const panel = (v: View) => cn(view === v ? "block" : "hidden", "lg:block");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Spend</h1>
      <BudgetTiles budget={budget} />
      <Segmented<View>
        label="Spend view"
        value={view}
        onChange={setView}
        className="flex w-full lg:hidden"
        options={[
          { value: "log", label: "Expenses" },
          { value: "categories", label: "Categories" },
          { value: "settle", label: "Settle up" },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start [&>*]:min-w-0">
        <div className={panel("log")}>
          <ExpenseLog budget={budget} onEdit={sheet.openEdit} onAdd={sheet.openAdd} />
        </div>
        <div className="space-y-4">
          <div className={panel("categories")}>
            <CategorySummary budget={budget} />
          </div>
          <div className={panel("settle")}>
            <SettleUp settlement={budget.settlement} />
          </div>
        </div>
      </div>
      <Fab label="Add expense" onClick={sheet.openAdd} />
      {sheet.mounted && <ExpenseSheet sheet={sheet} categories={budget.categories} travelers={budget.travelers} />}
    </div>
  );
}

export function SpendScreen() {
  return (
    <TripGate>
      <Spend />
    </TripGate>
  );
}
