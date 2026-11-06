"use client";

import { Gift, Plus } from "lucide-react";
import { EditOnly, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckButton } from "@/components/ui/check";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { giftsProgress } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const GiftSheet = dynamic(() => import("./gift-sheet").then((m) => m.GiftSheet), { ssr: false });

type GiftRow = Row<"gifts">;

/** Pasalubong: gifts to bring home. */
export function Gifts() {
  const trip = useTrip();
  const { data: gifts = [], isPending } = useRows("gifts");
  const update = useUpdateRow("gifts", "gift");
  const remove = useDeleteRow("gifts", "gift");
  const sheet = useSheet<GiftRow>();

  if (isPending) return <Skeleton className="h-48" />;
  const p = giftsProgress(gifts);
  const budget = gifts.reduce((s, g) => s + Number(g.budget ?? 0), 0);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {p.done} of {p.total} bought
            </p>
            {budget > 0 && <p className="text-sm text-fg-muted">Budget {formatMoney(budget, trip.home_currency)}</p>}
          </div>
          <EditOnly>
            <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </EditOnly>
        </div>
        <Progress value={p.percent} label="Gifts bought" className="mt-2" />
      </Card>

      {gifts.length === 0 ? (
        <Card className="text-center">
          <Gift className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-2 text-sm text-fg-muted">Who are you bringing pasalubong for?</p>
          <EditOnly>
            <Button className="mt-3" onClick={sheet.openAdd}>
              Add a gift
            </Button>
          </EditOnly>
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-border">
            {gifts.map((g) => (
              <SwipeRow
                key={g.id}
                label={`${g.gift} for ${g.for_whom}. Edit`}
                onOpen={() => sheet.openEdit(g)}
                onSwipeDelete={() => remove(g, `gift for ${g.for_whom}`)}
                leading={
                  <CheckButton
                    checked={g.bought}
                    onChange={(bought) => update.mutate({ id: g.id, patch: { bought } })}
                    label={`Bought: ${g.gift} for ${g.for_whom}`}
                    className="ml-1"
                  />
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{g.for_whom}</span>
                  <span className={cn("block text-sm text-fg-muted", g.bought && "line-through")}>{g.gift}</span>
                </span>
                {g.budget !== null && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(g.budget, trip.home_currency)}
                  </span>
                )}
              </SwipeRow>
            ))}
          </ul>
        </Card>
      )}
      {sheet.mounted && <GiftSheet sheet={sheet} />}
    </div>
  );
}
