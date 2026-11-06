"use client";

import { ExternalLink, Check, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { EditOnly, useTrip } from "@/components/trip-gate";
import { Board } from "@/components/ui/board";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { daysToGo, localISODate, tripLength } from "@/lib/calc";
import { formatDateRange, formatPercent } from "@/lib/format";
import { joinNames, nextUp } from "@/lib/home";
import type { Budget } from "@/lib/queries/budget";
import { useRows } from "@/lib/queries/table";
import { useClientValue } from "@/lib/use-client-value";
import { useMedia } from "@/lib/use-media";
import { bySort } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/** Days to go, then "Day X of N", then "Trip completed". Date-only comparison, so no timezone off-by-one. */
function CountChip() {
  const trip = useTrip();
  const today = useClientValue(localISODate, null);
  const c = today ? daysToGo(today, trip.start_date, trip.end_date) : null;
  const [big, small, calm] = !c
    ? [" ", " ", true]
    : c.kind === "before"
      ? [String(c.n), c.n === 1 ? "day to go" : "days to go", false]
      : c.kind === "during"
        ? [`Day ${c.n}`, `of ${c.of}`, true]
        : c.kind === "after"
          ? ["✓", "Trip completed", true]
          : ["–", "Set your dates", true];
  return (
    <div
      className={cn(
        "shrink-0 rounded-2xl px-3.5 py-2 text-center",
        calm ? "bg-teal-tint text-teal" : "bg-accent text-accent-ink",
      )}
    >
      <div className="font-display text-[28px] leading-none font-extrabold">{big}</div>
      <div className="text-[11px] font-bold tracking-wide uppercase">{small}</div>
    </div>
  );
}

export function TripTitle({ travelers }: { travelers: { name: string }[] }) {
  const trip = useTrip();
  const len = tripLength(trip.start_date, trip.end_date);
  const meta = [
    trip.start_date ? formatDateRange(trip.start_date, trip.end_date) : null,
    len ? `${len} days` : null,
    travelers.length ? joinNames(travelers.map((t) => t.name)) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[32px] leading-none font-extrabold tracking-tight lg:text-[40px]">
          {trip.name}
        </h1>
        {meta && <p className="mt-1.5 text-sm text-fg-muted">{meta}</p>}
      </div>
      <CountChip />
    </div>
  );
}

/** A picture of the route: no dragging or zooming, so it never traps the page scroll. */
export function RouteMap({ bottomInset }: { bottomInset: number }) {
  const { data: dests = [] } = useRows("destinations", bySort);
  const desktop = useMedia("(min-width: 1024px)");
  const stops = dests
    .filter((d) => d.lat !== null && d.lng !== null)
    .map((d) => ({ id: d.id, name: d.city, lat: Number(d.lat), lng: Number(d.lng) }));
  return (
    <MapView
      stops={stops}
      interactive={false}
      className="map-lift"
      label="Route map"
      insets={
        desktop ? { top: 48, right: 48, bottom: bottomInset, left: 48 } : { top: 56, right: 24, bottom: 56, left: 24 }
      }
    />
  );
}

/** Budget, spent and left, with one progress bar. Amounts are whole numbers in the home currency. */
export function BudgetBlock({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const over = budget.left < 0;
  const tile = (label: string, value: string, accent = false) => (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3 lg:bg-surface-2">
      <div className="text-xs font-bold text-fg-muted">{label}</div>
      <div className={cn("mt-0.5 text-[17px] font-extrabold tabular-nums", accent && "text-accent-text")}>{value}</div>
    </div>
  );
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        {tile("Budget", whole(budget.budget))}
        {tile("Spent", whole(budget.spent), true)}
        {tile(over ? "Over" : "Left", whole(Math.abs(budget.left)))}
      </div>
      <div>
        <Progress value={budget.percent} tone="coral" label="Budget used" className="h-2" />
        <p className="mt-1.5 text-xs text-fg-muted">
          {budget.budget > 0 ? `${formatPercent(budget.percent)} used.` : "No budget set."} Amounts in{" "}
          {trip.home_currency}.
        </p>
      </div>
    </div>
  );
}

/** The owner's setup checklist. Hidden from viewers and once every item is done. */
export function NextUp({ budget }: { budget: Budget }) {
  const trip = useTrip();
  const stops = useRows("destinations");
  const flights = useRows("flights");
  const stays = useRows("stays");
  const itinerary = useRows("itinerary_items");
  const ready = [stops, flights, stays, itinerary].every((q) => q.isSuccess);
  if (!ready) return null;
  const { items, allDone } = nextUp({
    hasDates: !!trip.start_date && !!trip.end_date,
    stops: stops.data?.length ?? 0,
    travelers: budget.travelers.length,
    flights: flights.data?.length ?? 0,
    stays: stays.data?.length ?? 0,
    itineraryItems: itinerary.data?.length ?? 0,
    plannedCategories: budget.categories.filter((c) => c.planned !== null && Number(c.planned) > 0).length,
  });
  if (allDone) return null;
  return (
    <EditOnly>
      <Card className="px-3.5 py-1.5 lg:px-4">
        <CardTitle className="pt-2.5 pb-1">Next up</CardTitle>
        <ul>
          {items.map((it) => (
            <li key={it.key} className="border-t border-border first:border-t-0">
              <Link
                href={it.href}
                className={cn("flex min-h-12 items-center gap-3 text-[15px]", it.done ? "font-medium" : "font-bold")}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full",
                    it.done ? "bg-teal text-teal-ink" : "border-2 border-line-strong",
                  )}
                  aria-hidden
                >
                  {it.done && <Check className="size-3.5" strokeWidth={3.5} />}
                </span>
                <span className={cn(it.done && "text-fg-muted line-through")}>
                  {it.label}
                  {it.done && <span className="sr-only"> (done)</span>}
                </span>
                {!it.done && <ChevronRight className="ml-auto size-[18px] text-fg-muted" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </EditOnly>
  );
}

export function routeUrl(dests: { city: string; country: string | null }[]) {
  const parts = dests.map((d) =>
    encodeURIComponent([d.city, d.country].filter(Boolean).join(", ")).replace(/%20/g, "+"),
  );
  return `https://www.google.com/maps/dir/${parts.join("/")}`;
}

/** The stops as a list: always there, whether or not the map works. */
export function StopsCard() {
  const { data: dests = [], isPending } = useRows("destinations", bySort);
  if (isPending) return <Skeleton className="h-32" />;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Stops</CardTitle>
        {dests.length > 1 && (
          <a
            href={routeUrl(dests)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-teal"
          >
            Open in Google Maps
            <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      {dests.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">
          <EditOnly>
            <Link href="/settings" className="font-bold text-teal underline">
              Add destinations
            </Link>{" "}
            to see your route on the map.
          </EditOnly>
        </p>
      ) : (
        <ol className="mt-1 divide-y divide-border">
          {dests.map((d, i) => (
            <li key={d.id} className="flex min-h-14 items-center gap-3 py-2">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-ground"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{d.city}</span>
                {d.country && <span className="block truncate text-[13px] text-fg-muted">{d.country}</span>}
              </span>
              <Board value={d.nights} size="sm" />
              <span className="sr-only">
                {d.nights} {d.nights === 1 ? "night" : "nights"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
