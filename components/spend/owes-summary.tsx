"use client";

import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { useState } from "react";
import { useTrip } from "@/components/trip-gate";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { personSummary, type Settlement } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { useMyName } from "@/lib/queries/ideas";
import { cn } from "@/lib/utils";

/**
 * A small summary for one person: what they owe and to whom, and who owes them. It starts on the traveler whose name
 * matches yours, and you can look at anyone else's. Worked out from the same settlement as Settle up.
 */
export function OwesSummary({ settlement }: { settlement: Settlement }) {
  const trip = useTrip();
  const cur = trip.home_currency;
  const myName = useMyName().data;
  const rows = settlement.rows;
  const mine = myName ? rows.find((r) => r.traveler.name.trim().toLowerCase() === myName.trim().toLowerCase()) : undefined;
  const [picked, setPicked] = useState<string | null>(null);
  if (rows.length < 2) return null;
  const who = rows.find((r) => r.traveler.id === picked) ?? mine ?? rows[0];
  const index = new Map(rows.map((r, i) => [r.traveler.id, i]));
  const s = personSummary(settlement, who.traveler.id);
  const owedTotal = s.owedBy.reduce((x, t) => x + t.amount, 0);
  const oweTotal = s.owes.reduce((x, t) => x + t.amount, 0);
  const square = s.owes.length === 0 && s.owedBy.length === 0;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-5 text-teal" aria-hidden />
            {who === mine ? "Your balance" : `${who.traveler.name}’s balance`}
          </CardTitle>
          <p
            className={cn("mt-1 text-sm font-semibold", s.net > 0 ? "text-teal" : s.net < 0 ? "text-danger" : "text-fg-muted")}
            aria-live="polite"
          >
            {square
              ? settlement.total > 0
                ? "All square. Nobody owes anything."
                : "No expenses yet."
              : s.net > 0
                ? `Owed ${formatMoney(s.net, cur)} overall`
                : s.net < 0
                  ? `Owes ${formatMoney(-s.net, cur)} overall`
                  : "Even overall"}
          </p>
        </div>
        <Select aria-label="Show the balance of" value={who.traveler.id} onChange={(e) => setPicked(e.target.value)} className="w-auto min-w-32">
          {rows.map((r) => (
            <option key={r.traveler.id} value={r.traveler.id}>
              {r.traveler.name}
              {r === mine ? " (you)" : ""}
            </option>
          ))}
        </Select>
      </div>

      {s.owes.length > 0 && (
        <section aria-label="Owes" className="space-y-1.5">
          <h3 className="flex items-center justify-between text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <ArrowUpRight className="size-4 text-danger" strokeWidth={2.6} aria-hidden />
              {who === mine ? "You owe" : `${who.traveler.name} owes`}
            </span>
            <span className="tabular-nums">{formatMoney(oweTotal, cur)}</span>
          </h3>
          <ul className="space-y-1.5">
            {s.owes.map((t) => (
              <li key={t.to.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <Avatar name={t.to.name} index={index.get(t.to.id)} className="size-7 text-xs" />
                <span className="font-semibold">{t.to.name}</span>
                <span className="ml-auto font-bold text-danger tabular-nums">{formatMoney(t.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.owedBy.length > 0 && (
        <section aria-label="Is owed" className="space-y-1.5">
          <h3 className="flex items-center justify-between text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <ArrowDownLeft className="size-4 text-teal" strokeWidth={2.6} aria-hidden />
              {who === mine ? "Owed to you" : `Owed to ${who.traveler.name}`}
            </span>
            <span className="tabular-nums">{formatMoney(owedTotal, cur)}</span>
          </h3>
          <ul className="space-y-1.5">
            {s.owedBy.map((t) => (
              <li key={t.from.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <Avatar name={t.from.name} index={index.get(t.from.id)} className="size-7 text-xs" />
                <span className="font-semibold">{t.from.name}</span>
                <span className="ml-auto font-bold text-teal tabular-nums">{formatMoney(t.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}
