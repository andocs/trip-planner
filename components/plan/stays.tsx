"use client";

import { BedDouble, Plus } from "lucide-react";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { pricePerNight, stayNights, tripNights } from "@/lib/calc";
import { formatDay, formatMoney } from "@/lib/format";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const StaySheet = dynamic(() => import("./stay-sheet").then((m) => m.StaySheet), { ssr: false });
export { StaySheet };

type Stay = Row<"stays">;
const byCheckIn = (a: Stay, b: Stay) =>
  (a.check_in ?? "9").localeCompare(b.check_in ?? "9") || a.created_at.localeCompare(b.created_at);

export function Stays() {
  const trip = useTrip();
  const { data: stays = [], isPending } = useRows("stays", byCheckIn);
  const update = useUpdateRow("stays", "stay");
  const remove = useDeleteRow("stays", "stay");
  const sheet = useSheet<Stay>();
  const cur = trip.home_currency;

  const active = stays.filter((s) => s.status !== "Cancelled");
  const total = active.reduce((s, x) => s + Number(x.total ?? 0), 0);
  const nights = active.reduce((s, x) => s + (stayNights(x.check_in, x.check_out) ?? 0), 0);
  const needed = tripNights(trip.start_date, trip.end_date);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <CardTitle>Stays</CardTitle>
          {stays.length > 0 && (
            <p className="mt-0.5 text-sm text-fg-muted">
              {formatMoney(total, cur)} · {nights} {nights === 1 ? "night" : "nights"}
              {needed !== null && ` of ${needed}`}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-32" />
      ) : stays.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">Plan where you&rsquo;ll sleep each night and track bookings.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {stays.map((s) => {
            const n = stayNights(s.check_in, s.check_out);
            const ppn = pricePerNight(s.total, n);
            return (
              <SwipeRow
                key={s.id}
                label={`${s.hotel}, ${s.city ?? ""}. Edit`}
                onOpen={() => sheet.openEdit(s)}
                onSwipeDelete={() => remove(s, s.hotel)}
                trailing={
                  <StatusChip
                    status={s.status}
                    label={s.hotel}
                    onChange={(status) => update.mutate({ id: s.id, patch: { status } })}
                  />
                }
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/15 text-primary">
                  <BedDouble className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.hotel}</span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[s.city, s.room].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block text-xs text-fg-muted tabular-nums">
                    {s.check_in
                      ? `${formatDay(s.check_in, "d MMM")} → ${formatDay(s.check_out, "d MMM")}`
                      : "Dates not set"}
                    {n !== null && ` · ${n} ${n === 1 ? "night" : "nights"}`}
                  </span>
                  {s.total !== null && (
                    <span className="block text-xs font-semibold tabular-nums">
                      {formatMoney(s.total, cur)}
                      {ppn !== null && (
                        <span className="font-normal text-fg-muted"> · {formatMoney(ppn, cur)}/night</span>
                      )}
                    </span>
                  )}
                </span>
              </SwipeRow>
            );
          })}
        </ul>
      )}
      {sheet.mounted && <StaySheet sheet={sheet} />}
    </Card>
  );
}
