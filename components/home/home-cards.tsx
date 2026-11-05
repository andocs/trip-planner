"use client";

import { CalendarDays, ExternalLink, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useTrip } from "@/components/trip-gate";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookedProgress,
  daysToGo,
  giftsProgress,
  itineraryProgress,
  localISODate,
  packedProgress,
  tripLength,
} from "@/lib/calc";
import { formatDateRange, formatMoney, formatPercent } from "@/lib/format";
import type { Budget } from "@/lib/queries/budget";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { donutSlices } from "./chart-data";
import type { MapStop } from "./geo-map";

const ChartFallback = () => <Skeleton className="h-48" />;
const PlannedVsSpent = dynamic(() => import("./charts").then((m) => m.PlannedVsSpent), {
  ssr: false,
  loading: ChartFallback,
});
const SpendDonut = dynamic(() => import("./charts").then((m) => m.SpendDonut), { ssr: false, loading: ChartFallback });
const GeoMap = dynamic(() => import("./geo-map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[4/3] w-full" />,
});

// ---------------------------------------------------------------------------

export function Hero({ travelers }: { travelers: Row<"travelers">[] }) {
  const trip = useTrip();
  const len = tripLength(trip.start_date, trip.end_date);
  return (
    <section className="relative overflow-hidden rounded-3xl bg-hero p-5 text-hero-fg shadow-card sm:p-6">
      <div className="absolute -right-10 -bottom-14 size-44 rounded-full bg-teal/25" aria-hidden />
      <div className="absolute right-20 -bottom-20 size-32 rounded-full bg-gold/20" aria-hidden />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/75">{trip.destination ?? "Destination not set"}</p>
          <h1 className="mt-0.5 text-3xl leading-tight font-bold">{trip.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-white/85">
            <CalendarDays className="size-4" aria-hidden />
            {formatDateRange(trip.start_date, trip.end_date)}
            {len !== null && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{len} days</span>
            )}
          </p>
        </div>
        <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10">
          <Link href="/settings" aria-label="Trip settings">
            <Settings className="size-5" aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="relative mt-4 flex items-center">
        {travelers.length ? (
          <ul className="flex -space-x-2" aria-label="Travelers">
            {travelers.map((t, i) => (
              <li key={t.id} title={t.name}>
                <Avatar name={t.name} index={i} className="size-9 ring-2 ring-hero" />
                <span className="sr-only">{t.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Link href="/settings" className="text-sm font-semibold text-white underline underline-offset-4">
            Add travelers
          </Link>
        )}
      </div>
    </section>
  );
}

export function CountdownTile() {
  const trip = useTrip();
  const c = daysToGo(localISODate(), trip.start_date, trip.end_date);
  const [big, small] =
    c.kind === "before"
      ? [String(c.n), c.n === 1 ? "day to go" : "days to go"]
      : c.kind === "during"
        ? [`Day ${c.n}`, `of ${c.of}`]
        : c.kind === "after"
          ? ["✓", "Trip completed"]
          : ["–", "Set your dates"];
  return (
    <Card className="flex flex-col justify-between bg-teal/10">
      <CardTitle>Countdown</CardTitle>
      <p className="mt-2">
        <span className="block text-3xl font-bold text-primary tabular-nums">{big}</span>
        <span className="text-sm font-medium text-fg-muted">{small}</span>
      </p>
    </Card>
  );
}

export function BudgetTilesGrid({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const cur = trip.home_currency;
  const over = budget.left < 0;
  return (
    <>
      <Tile label="Budget" value={formatMoney(budget.budget, cur)} />
      <Tile label="Spent" value={formatMoney(budget.spent, cur)} />
      <Tile
        label={over ? "Over budget" : "Remaining"}
        value={formatMoney(Math.abs(budget.left), cur)}
        valueClass={over ? "text-danger" : undefined}
      />
      <Card className="col-span-2 md:col-span-4">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle>Budget used</CardTitle>
          <p className="text-2xl font-bold tabular-nums">{budget.budget > 0 ? formatPercent(budget.percent) : "–"}</p>
        </div>
        <Progress value={budget.percent} tone="budget" label="Budget used" className="mt-2" />
      </Card>
    </>
  );
}

function Tile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card className="flex flex-col justify-between">
      <CardTitle>{label}</CardTitle>
      <p className={cn("mt-2 text-lg font-bold break-words tabular-nums", valueClass)}>{value}</p>
    </Card>
  );
}

export function ChartsCard({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const slices = donutSlices(budget.lines);
  return (
    <>
      <Card className="col-span-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Planned vs spent</CardTitle>
          <ul className="flex gap-4 text-xs font-medium text-fg-muted">
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
          <PlannedVsSpent lines={budget.lines} currency={trip.home_currency} />
        </div>
        <TableView budget={budget} />
      </Card>
      <Card className="col-span-2 min-w-0">
        <CardTitle>Where the money went</CardTitle>
        <div className="mt-3">
          <SpendDonut slices={slices} total={budget.spent} currency={trip.home_currency} />
        </div>
      </Card>
    </>
  );
}

function TableView({ budget }: { budget: Budget }) {
  const trip = useTrip();
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        View as table
      </summary>
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

// ---------------------------------------------------------------------------

export function routeUrl(dests: { city: string; country: string | null }[]) {
  const parts = dests.map((d) =>
    encodeURIComponent([d.city, d.country].filter(Boolean).join(", ")).replace(/%20/g, "+"),
  );
  return `https://www.google.com/maps/dir/${parts.join("/")}`;
}

export function MapCard() {
  const trip = useTrip();
  const { data: dests = [], isPending } = useRows("destinations", bySort);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const stops: MapStop[] = dests
    .filter((d) => d.lat !== null && d.lng !== null)
    .map((d) => ({ city: d.city, country: d.country, nights: d.nights, lat: Number(d.lat), lng: Number(d.lng) }));
  const maxNights = Math.max(1, ...dests.map((d) => d.nights));

  return (
    <Card className="col-span-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Route</CardTitle>
        {dests.length > 1 && (
          <a
            href={routeUrl(dests)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
          >
            Open in Google Maps
            <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      {isPending ? (
        <Skeleton className="mt-3 aspect-[4/3] w-full" />
      ) : dests.length === 0 ? (
        <p className="py-4 text-sm text-fg-muted">
          <Link href="/settings" className="font-semibold text-primary underline">
            Add destinations
          </Link>{" "}
          to see your route on a map.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-[3fr_2fr] md:items-center">
          {stops.length > 0 && !failed && <GeoMap stops={stops} region={trip.map_region} onError={onError} />}
          {failed && (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
              The map couldn&rsquo;t load. Here are your stops.
            </p>
          )}
          <ol className="space-y-2.5">
            {dests.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal/15 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{d.city}</span>
                    <span className="shrink-0 text-fg-muted tabular-nums">
                      {d.nights} {d.nights === 1 ? "night" : "nights"}
                    </span>
                  </div>
                  <Progress value={(d.nights / maxNights) * 100} label={`${d.city} nights`} className="mt-1 h-1.5" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function ReadinessCard() {
  const packing = useRows("packing_items");
  const itin = useRows("itinerary_items");
  const stays = useRows("stays");
  const flights = useRows("flights");
  const gifts = useRows("gifts");

  const items = [
    { label: "Packed", href: "/pack", p: packedProgress(packing.data ?? []) },
    { label: "Itinerary done", href: "/plan", p: itineraryProgress(itin.data ?? []) },
    { label: "Stays booked", href: "/plan", p: bookedProgress(stays.data ?? []) },
    { label: "Flights booked", href: "/plan", p: bookedProgress(flights.data ?? []) },
    { label: "Gifts bought", href: "/pack", p: giftsProgress(gifts.data ?? []) },
  ];

  return (
    <Card>
      <CardTitle>Getting ready</CardTitle>
      <ul className="mt-3 space-y-3">
        {items.map(({ label, href, p }) => (
          <li key={label}>
            <Link href={href} className="block rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="text-fg-muted tabular-nums">
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
