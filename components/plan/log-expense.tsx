"use client";

import { Check, Receipt } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { EditOnly } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { sourceKey, type LoggableKind } from "@/lib/log-expense";
import { useRows, type Row } from "@/lib/queries/table";
import type { Stay } from "@/lib/stays";
import { bySort, useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

// The same sheet as Spend's Add expense, opened from the booking and prefilled from it.
const ExpenseSheet = dynamic(() => import("@/components/spend/expense-sheet").then((m) => m.ExpenseSheet), { ssr: false });

/** Every expense that was logged from a flight or stay, by the booking it paid for. */
export function useLoggedExpenses() {
  const rows = useRows("expenses");
  const map = new Map<string, Row<"expenses">>();
  for (const e of rows.data ?? [])
    if (e.source_table && e.source_id) map.set(sourceKey(e.source_table, e.source_id), e);
  return map;
}

/**
 * Under a flight or stay: the owner's "Log as expense" button, or a "Logged" chip once it has been logged (everyone sees
 * the chip). Nothing shows until it is Booked or Done and has a price.
 */
export function LogExpenseRow({
  kind,
  item,
  className,
}: {
  kind: LoggableKind;
  item: Row<"flights"> | Stay;
  className?: string;
}) {
  const logged = useLoggedExpenses().get(sourceKey(kind, item.id));
  const amount = kind === "flights" ? (item as Row<"flights">).fare : (item as Stay).total;
  const sheet = useSheet<Row<"expenses">>();
  const categories = useRows("categories", bySort);
  const travelers = useRows("travelers", bySort);
  // Only a chip that appears AFTER the page loaded pops in (a booking that was already logged just shows it).
  const [loggedOnLoad] = useState(!!logged);

  if (logged)
    return (
      <div className={cn("pb-2", className)}>
        <Link
          href="/spend"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-tint px-3.5 text-sm font-bold text-teal",
            !loggedOnLoad && "pop-in",
          )}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
          Logged · {formatDay(logged.spent_on, "d MMM")}
          <span className="sr-only"> as an expense. Open Spend.</span>
        </Link>
      </div>
    );
  // Only a booking can have been paid: ideas, plans and price quotes are not logged.
  if (item.status !== "Booked" && item.status !== "Done") return null;
  if (!amount || Number(amount) <= 0) return null;
  return (
    <EditOnly>
      <div className={cn("pb-2", className)}>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Receipt className="size-4" aria-hidden />
          Log as expense
        </Button>
      </div>
      {sheet.mounted && <ExpenseSheet sheet={sheet} categories={categories.data ?? []} travelers={travelers.data ?? []} source={{ kind, item }} />}
    </EditOnly>
  );
}
