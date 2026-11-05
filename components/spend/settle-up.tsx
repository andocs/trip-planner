"use client";

import { ArrowRight, Info } from "lucide-react";
import { useTrip } from "@/components/trip-gate";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardTitle } from "@/components/ui/card";
import type { Settlement } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Who owes whom" lines only — used on Home. */
export function TransfersList({ settlement }: { settlement: Settlement }) {
  const trip = useTrip();
  if (settlement.rows.length < 2)
    return <p className="text-sm text-fg-muted">Add at least two travelers to split costs.</p>;
  if (settlement.transfers.length === 0)
    return (
      <p className="text-sm text-fg-muted">
        {settlement.total > 0 ? "All square. Nobody owes anything." : "No expenses yet."}
      </p>
    );
  const order = new Map(settlement.rows.map((r, i) => [r.traveler.id, i]));
  return (
    <ul className="space-y-2">
      {settlement.transfers.map((t) => (
        <li key={`${t.from.id}-${t.to.id}`} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
          <Avatar name={t.from.name} index={order.get(t.from.id)} className="size-8 text-xs" />
          <span className="font-semibold">{t.from.name}</span>
          <ArrowRight className="size-4 text-fg-muted" aria-label="pays" />
          <Avatar name={t.to.name} index={order.get(t.to.id)} className="size-8 text-xs" />
          <span className="font-semibold">{t.to.name}</span>
          <span className="ml-auto font-bold tabular-nums">{formatMoney(t.amount, trip.home_currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SettleUp({ settlement }: { settlement: Settlement }) {
  const trip = useTrip();
  const cur = trip.home_currency;

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Settle up</CardTitle>
        <p className="mt-1 text-sm text-fg-muted">
          {formatMoney(settlement.total, cur)} split equally
          {settlement.rows.length > 0 && ` · ${formatMoney(settlement.share, cur)} each`}
        </p>
      </div>

      {settlement.rows.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Paid, fair share and balance per traveler</caption>
          <thead>
            <tr className="text-xs text-fg-muted uppercase">
              <th scope="col" className="pb-2 text-left font-semibold">
                Traveler
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                Paid
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                Balance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {settlement.rows.map((r) => (
              <tr key={r.traveler.id}>
                <th scope="row" className="py-2 text-left font-semibold">
                  {r.traveler.name}
                </th>
                <td className="py-2 text-right">{formatMoney(r.paid, cur)}</td>
                <td
                  className={cn(
                    "py-2 text-right font-semibold",
                    r.balance >= 0.5 ? "text-primary" : r.balance <= -0.5 ? "text-danger" : "text-fg-muted",
                  )}
                >
                  {r.balance > 0 ? "+" : ""}
                  {formatMoney(r.balance, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <TransfersList settlement={settlement} />

      {settlement.unassigned > 0 && (
        <p className="flex gap-2 rounded-xl bg-gold/20 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {formatMoney(settlement.unassigned, cur)} of expenses have no &ldquo;paid by&rdquo;. They count in the total
            but nobody gets credit for them. Set who paid to balance things out.
          </span>
        </p>
      )}
    </Card>
  );
}
