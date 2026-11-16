"use client";

import { BoardingPass, LayoverPill } from "@/components/plan/boarding-pass";
import { EmptyText } from "@/components/view-only-banner";
import { Fragment } from "react";
import { ExternalLink, Plane, Plus } from "lucide-react";
import { EditOnly, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { withLayovers } from "@/lib/flights";
import { formatMoney } from "@/lib/format";
import { useFlightRefs } from "@/lib/queries/flights";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { safeHref } from "@/lib/utils";
import { useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const FlightSheet = dynamic(() => import("./flight-sheets").then((m) => m.FlightSheet), { ssr: false });
const TransferSheet = dynamic(() => import("./flight-sheets").then((m) => m.TransferSheet), { ssr: false });
export { FlightSheet };

type Flight = Row<"flights">;
type Transfer = Row<"transfers">;

const byDeparture = (a: Flight, b: Flight) =>
  (a.departs_at ?? "9").localeCompare(b.departs_at ?? "9") || a.created_at.localeCompare(b.created_at);

export function Flights() {
  const trip = useTrip();
  const { data: flights = [], isPending } = useRows("flights", byDeparture);
  const { byFlight } = useFlightRefs();
  const update = useUpdateRow("flights", "flight");
  const sheet = useSheet<Flight>();
  const total = flights.filter((f) => f.status !== "Cancelled").reduce((s, f) => s + Number(f.fare ?? 0), 0);
  const rows = withLayovers(flights);

  return (
    <div className="space-y-4">
      <section aria-label="Flights" className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-tight">Flights</h2>
            {flights.length > 0 && (
              <p className="mt-0.5 text-sm text-fg-muted">Fares {formatMoney(total, trip.home_currency)}</p>
            )}
          </div>
          <EditOnly>
            <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </EditOnly>
        </div>
        {isPending ? (
          <Skeleton className="h-48 rounded-[22px]" />
        ) : flights.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-5 py-9 text-center">
            <Plane className="size-10 text-fg-muted" strokeWidth={1.8} aria-hidden />
            <h3 className="font-display text-2xl font-extrabold tracking-tight">No flights yet</h3>
            <p className="max-w-[40ch] text-fg-muted">
              <EmptyText>
                Add a flight and it becomes a boarding pass: route, times, terminal, gate and seat in one place. Prices
                count toward your planned budget.
              </EmptyText>
            </p>
            <EditOnly>
              <Button onClick={sheet.openAdd}>
                <Plus className="size-[18px]" aria-hidden />
                Add a flight
              </Button>
            </EditOnly>
          </Card>
        ) : (
          <ul className="space-y-4">
            {rows.map(({ flight: f, layover }) => (
              <Fragment key={f.id}>
                {layover && <LayoverPill minutes={layover.minutes} airport={layover.airport} />}
                <li>
                  <BoardingPass
                    flight={f}
                    bookingRef={byFlight.get(f.id)?.booking_ref ?? null}
                    onOpen={() => sheet.openEdit(f)}
                    onStatus={(status) => update.mutate({ id: f.id, patch: { status } })}
                  />
                </li>
              </Fragment>
            ))}
          </ul>
        )}
      </section>
      {sheet.mounted && <FlightSheet sheet={sheet} />}
      <Transfers />
    </div>
  );
}

function Transfers() {
  const { data: transfers = [], isPending } = useRows("transfers");
  const remove = useDeleteRow("transfers", "transfer");
  const sheet = useSheet<Transfer>();

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Transfers</CardTitle>
        <EditOnly>
          <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </EditOnly>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-20" />
      ) : transfers.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">Buses, trains, airport pickups between your stops.</p>
      ) : (
        <ul className="mt-2 space-y-1 lg:grid lg:grid-cols-2 lg:space-y-0 lg:gap-x-4">
          {transfers.map((t) => {
            const href = safeHref(t.link);
            return (
              <SwipeRow
                key={t.id}
                className="lg:border-b lg:border-border"
                label={`${t.route}. Edit`}
                onOpen={() => sheet.openEdit(t)}
                onSwipeDelete={() => remove(t, t.route)}
                trailing={
                  href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onPointerDown={(e) => e.stopPropagation()}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-teal hover:bg-surface-2"
                      aria-label={`Open link for ${t.route} (new tab)`}
                    >
                      <ExternalLink className="size-5" aria-hidden />
                    </a>
                  )
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.route}</span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[t.provider, t.cost_text].filter(Boolean).join(" · ") || "No details yet"}
                  </span>
                </span>
              </SwipeRow>
            );
          })}
        </ul>
      )}
      {sheet.mounted && <TransferSheet sheet={sheet} />}
    </Card>
  );
}
