"use client";

import { MapPinPlus, Receipt, UserPlus, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { DestinationSheet } from "@/components/settings/destinations-section";
import { TravelerSheet } from "@/components/settings/travelers-section";
import { ExpenseSheet } from "@/components/spend/expense-sheet";
import { Fab } from "@/components/ui/fab";
import { Sheet } from "@/components/ui/sheet";
import type { Budget } from "@/lib/queries/budget";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";

type Action = { key: string; label: string; hint: string; icon: LucideIcon; open: () => void };

/** The + button on Home: a menu of the most common "add" actions, each opening its own sheet. */
export function QuickAdd({ budget }: { budget: Budget }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const expense = useSheet<Row<"expenses">>();
  const destination = useSheet<Row<"destinations">>();
  const traveler = useSheet<Row<"travelers">>();
  const { data: dests } = useRows("destinations", bySort);

  // Close the menu first, then open the target sheet, so two drawers never stack.
  const go = (open: () => void) => () => {
    setMenuOpen(false);
    window.setTimeout(open, 150);
  };

  const actions: Action[] = [
    { key: "expense", label: "Expense", hint: "Log something you paid for", icon: Receipt, open: go(expense.openAdd) },
    {
      key: "destination",
      label: "Destination",
      hint: "A city on your route",
      icon: MapPinPlus,
      open: go(destination.openAdd),
    },
    { key: "traveler", label: "Traveler", hint: "Someone sharing costs", icon: UserPlus, open: go(traveler.openAdd) },
  ];

  return (
    <>
      <Fab label="Quick add" onClick={() => setMenuOpen(true)} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Add to trip">
        <ul className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2">
          {actions.map(({ key, label, hint, icon: Icon, open }) => (
            <li key={key}>
              <button
                type="button"
                onClick={open}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/15 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-fg-muted">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <ExpenseSheet sheet={expense} categories={budget.categories} travelers={budget.travelers} />
      <DestinationSheet sheet={destination} sort={nextSort(dests)} />
      <TravelerSheet sheet={traveler} sort={nextSort(budget.travelers)} />
    </>
  );
}
