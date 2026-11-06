"use client";

import { ExternalLink, Plane, Plus } from "lucide-react";
import { EditOnly, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { formatDateTime, formatMoney } from "@/lib/format";
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
  const update = useUpdateRow("flights", "flight");
  const remove = useDeleteRow("flights", "flight");
  const sheet = useSheet<Flight>();
  const total = flights.filter((f) => f.status !== "Cancelled").reduce((s, f) => s + Number(f.fare ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Flights</CardTitle>
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
          <Skeleton className="mt-3 h-20" />
        ) : flights.length === 0 ? (
          <p className="py-3 text-sm text-fg-muted">Add your flights to keep times and booking refs in one place.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {flights.map((f) => (
              <SwipeRow
                key={f.id}
                label={`${f.from_code ?? "?"} to ${f.to_code ?? "?"} ${f.flight_no ?? ""}. Edit`}
                onOpen={() => sheet.openEdit(f)}
                onSwipeDelete={() => remove(f, `${f.from_code ?? ""} → ${f.to_code ?? ""}`)}
                trailing={
                  <StatusChip
                    status={f.status}
                    label={`${f.from_code} to ${f.to_code}`}
                    onChange={(status) => update.mutate({ id: f.id, patch: { status } })}
                  />
                }
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-ground">
                  <Plane className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold tracking-wide">
                    {f.from_code ?? "???"} → {f.to_code ?? "???"}
                  </span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[f.airline, f.flight_no].filter(Boolean).join(" ") || "Airline not set"}
                  </span>
                  {f.departs_at && (
                    <span className="block text-xs text-fg-muted">
                      {formatDateTime(f.departs_at)}
                      {f.arrives_at && ` → ${formatDateTime(f.arrives_at)}`}
                    </span>
                  )}
                  {(f.fare !== null || f.booking_ref) && (
                    <span className="block text-xs tabular-nums">
                      {f.fare !== null && (
                        <span className="font-semibold">{formatMoney(f.fare, trip.home_currency)}</span>
                      )}
                      {f.fare !== null && f.booking_ref && " · "}
                      {f.booking_ref && <span className="font-mono">Ref {f.booking_ref}</span>}
                    </span>
                  )}
                </span>
              </SwipeRow>
            ))}
          </ul>
        )}
      </Card>
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
        <ul className="mt-2 space-y-1">
          {transfers.map((t) => {
            const href = safeHref(t.link);
            return (
              <SwipeRow
                key={t.id}
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
