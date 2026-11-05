"use client";

import { Backpack, CalendarPlus, MapPinPlus, Receipt, UserPlus, type LucideIcon } from "lucide-react";
import { PackingSheet } from "@/components/pack/packing";
import { ItinerarySheet } from "@/components/plan/itinerary-sheet";
import { DestinationSheet } from "@/components/settings/destinations-section";
import { TravelerSheet } from "@/components/settings/travelers-section";
import { ExpenseSheet } from "@/components/spend/expense-sheet";
import { Sheet } from "@/components/ui/sheet";
import type { Budget } from "@/lib/queries/budget";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";

type Action = { key: string; label: string; hint: string; icon: LucideIcon; open: () => void };

/** The quick-add menu and its sheets. Loaded on the first tap of the + button (see quick-add.tsx). */
export function QuickAddMenu({
  budget,
  menuOpen,
  setMenuOpen,
}: {
  budget: Budget;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const expense = useSheet<Row<"expenses">>();
  const destination = useSheet<Row<"destinations">>();
  const traveler = useSheet<Row<"travelers">>();
  const activity = useSheet<Row<"itinerary_items">>();
  const packing = useSheet<Row<"packing_items">>();
  const { data: packItems } = useRows("packing_items");
  const { data: dests } = useRows("destinations", bySort);

  // Close the menu first, then open the target sheet, so two drawers never stack.
  const go = (open: () => void) => () => {
    setMenuOpen(false);
    window.setTimeout(open, 150);
  };

  const actions: Action[] = [
    { key: "expense", label: "Expense", hint: "Log something you paid for", icon: Receipt, open: go(expense.openAdd) },
    {
      key: "activity",
      label: "Activity",
      hint: "Something to do on a day",
      icon: CalendarPlus,
      open: go(activity.openAdd),
    },
    {
      key: "destination",
      label: "Destination",
      hint: "A city on your route",
      icon: MapPinPlus,
      open: go(destination.openAdd),
    },
    { key: "packing", label: "Packing item", hint: "Something to bring", icon: Backpack, open: go(packing.openAdd) },
    { key: "traveler", label: "Traveler", hint: "Someone sharing costs", icon: UserPlus, open: go(traveler.openAdd) },
  ];

  return (
    <>
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
      <ItinerarySheet sheet={activity} cities={(dests ?? []).map((d) => d.city)} />
      <PackingSheet
        sheet={packing}
        categories={[...new Set((packItems ?? []).map((i) => i.category).filter((c): c is string => !!c))]}
        people={budget.travelers.map((t) => t.name)}
      />
    </>
  );
}
