"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gift, Plus } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckButton } from "@/components/ui/check";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { giftsProgress } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

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
          <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>
        <Progress value={p.percent} label="Gifts bought" className="mt-2" />
      </Card>

      {gifts.length === 0 ? (
        <Card className="text-center">
          <Gift className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-2 text-sm text-fg-muted">Who are you bringing pasalubong for?</p>
          <Button className="mt-3" onClick={sheet.openAdd}>
            Add a gift
          </Button>
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
      <GiftSheet sheet={sheet} />
    </div>
  );
}

const Schema = z.object({
  for_whom: requiredText("For whom", 120),
  gift: requiredText("Gift", 300),
  budget: optionalNumber({ min: 0 }),
  bought: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

function GiftSheet({ sheet }: { sheet: ReturnType<typeof useSheet<GiftRow>> }) {
  const trip = useTrip();
  const insert = useInsertRow("gifts", "gift");
  const update = useUpdateRow("gifts", "gift");
  const remove = useDeleteRow("gifts", "gift");
  const { register, handleSubmit, reset, formState, control } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({ for_whom: r?.for_whom ?? "", gift: r?.gift ?? "", budget: str(r?.budget), bought: r?.bought ?? false });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit gift" : "Add gift"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `gift for ${sheet.row!.for_whom}`);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="For whom" error={errors.for_whom?.message}>
        {(p) => <Input {...p} {...register("for_whom")} autoComplete="off" placeholder="e.g. Mama and Ate Pup" />}
      </Field>
      <Field label="Gift idea" error={errors.gift?.message}>
        {(p) => <Textarea {...p} {...register("gift")} rows={2} placeholder="e.g. Vietnamese coffee beans" />}
      </Field>
      <Field label={`Budget (${trip.home_currency})`} error={errors.budget?.message}>
        {(p) => <Input {...p} {...register("budget")} inputMode="decimal" />}
      </Field>
      <Controller
        control={control}
        name="bought"
        render={({ field }) => (
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
            Bought
          </label>
        )}
      />
    </RowSheet>
  );
}
