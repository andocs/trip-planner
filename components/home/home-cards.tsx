"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTrip } from "@/components/trip-gate";
import { Card, CardTitle } from "@/components/ui/card";
import { InView } from "@/components/ui/in-view";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { bookedProgress, giftsProgress, itineraryProgress, packedProgress } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import type { Budget } from "@/lib/queries/budget";
import { useRows } from "@/lib/queries/table";
import { donutSlices } from "./chart-data";

const ChartFallback = () => <Skeleton className="h-48" />;
const PlannedVsSpent = dynamic(() => import("./charts").then((m) => m.PlannedVsSpent), {
  ssr: false,
  loading: ChartFallback,
});
const SpendDonut = dynamic(() => import("./charts").then((m) => m.SpendDonut), { ssr: false, loading: ChartFallback });

export function PlannedVsSpentCard({ budget }: { budget: Budget }) {
  const trip = useTrip();
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Planned vs spent</CardTitle>
        <ul className="flex gap-4 text-xs font-bold text-fg-muted">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[var(--chart-planned)]" aria-hidden />
            Planned
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[var(--chart-spent)]" aria-hidden />
            Spent
          </li>
        </ul>
      </div>
      <div className="mt-3">
        <InView placeholder={<ChartFallback />}>
          <PlannedVsSpent lines={budget.lines} currency={trip.home_currency} />
        </InView>
      </div>
      <TableView budget={budget} />
    </Card>
  );
}

export function SpendDonutCard({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const slices = donutSlices(budget.lines);
  return (
    <Card className="min-w-0">
      <CardTitle>Where the money went</CardTitle>
      <div className="mt-3">
        <InView placeholder={<ChartFallback />}>
          <SpendDonut slices={slices} total={budget.spent} currency={trip.home_currency} />
        </InView>
      </div>
    </Card>
  );
}

function TableView({ budget }: { budget: Budget }) {
  const trip = useTrip();
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-teal">View as table</summary>
      <table className="w-full tabular-nums">
        <thead className="text-xs text-fg-muted uppercase">
          <tr>
            <th scope="col" className="py-1 text-left">
              Category
            </th>
            <th scope="col" className="py-1 text-right">
              Planned
            </th>
            <th scope="col" className="py-1 text-right">
              Spent
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {budget.lines.map((l) => (
            <tr key={l.id ?? "none"}>
              <th scope="row" className="py-1.5 text-left font-medium">
                {l.name}
              </th>
              <td className="py-1.5 text-right">
                {l.planned === null ? "–" : formatMoney(l.planned, trip.home_currency)}
              </td>
              <td className="py-1.5 text-right">{formatMoney(l.spent, trip.home_currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function ReadinessCard() {
  const packing = useRows("packing_items");
  const itin = useRows("itinerary_items");
  const stays = useRows("stays");
  const flights = useRows("flights");
  const gifts = useRows("gifts");

  const items = [
    { label: "Packed", href: "/pack", p: packedProgress(packing.data ?? []) },
    { label: "Itinerary done", href: "/plan", p: itineraryProgress(itin.data ?? []) },
    { label: "Stays booked", href: "/plan?tab=stays", p: bookedProgress(stays.data ?? []) },
    { label: "Flights booked", href: "/plan?tab=flights", p: bookedProgress(flights.data ?? []) },
    { label: "Gifts bought", href: "/pack?tab=gifts", p: giftsProgress(gifts.data ?? []) },
  ];

  return (
    <Card>
      <CardTitle>Getting ready</CardTitle>
      <ul className="mt-3 space-y-3">
        {items.map(({ label, href, p }) => (
          <li key={label}>
            <Link href={href} className="block rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="font-bold">{label}</span>
                <span className="font-mono text-fg-muted tabular-nums">
                  {p.total ? `${p.done} of ${p.total}` : "Nothing yet"}
                </span>
              </div>
              <Progress value={p.percent} label={label} className="mt-1" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
