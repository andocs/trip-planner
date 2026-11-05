"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { pricePerNight } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Idea = Row<"hotel_ideas">;
const ppnOf = (i: Idea) => pricePerNight(i.total, i.nights);

export function HotelIdeas() {
  const trip = useTrip();
  const { data: ideas = [], isPending } = useRows("hotel_ideas");
  const remove = useDeleteRow("hotel_ideas", "hotel idea");
  const sheet = useSheet<Idea>();
  const cur = trip.home_currency;

  // Grouped by city, cheapest per night first; cities in the order they were first added.
  const groups = new Map<string, Idea[]>();
  for (const i of ideas) groups.set(i.city ?? "Anywhere", [...(groups.get(i.city ?? "Anywhere") ?? []), i]);
  for (const list of groups.values())
    list.sort((a, b) => (ppnOf(a) ?? Infinity) - (ppnOf(b) ?? Infinity) || a.hotel.localeCompare(b.hotel));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">A shortlist to compare before you book.</p>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="h-40" />
      ) : ideas.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">Add hotels you&rsquo;re considering, with nights and total price.</p>
        </Card>
      ) : (
        [...groups.entries()].map(([city, list]) => {
          const cheapest = ppnOf(list[0]);
          return (
            <Card key={city}>
              <CardTitle>
                {city} · {list.length}
              </CardTitle>
              <ul className="mt-2 space-y-1">
                {list.map((i) => {
                  const ppn = ppnOf(i);
                  return (
                    <SwipeRow
                      key={i.id}
                      label={`${i.hotel}. Edit`}
                      onOpen={() => sheet.openEdit(i)}
                      onSwipeDelete={() => remove(i, i.hotel)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{i.hotel}</span>
                        <span className="block truncate text-sm text-fg-muted">
                          {[i.room, i.nights !== null ? `${i.nights} ${i.nights === 1 ? "night" : "nights"}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-semibold">{ppn !== null ? formatMoney(ppn, cur) : "–"}</span>
                        <span className="block text-xs text-fg-muted">
                          {ppn !== null && ppn === cheapest && list.length > 1 ? "cheapest · " : ""}per night
                        </span>
                      </span>
                    </SwipeRow>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
      <HotelIdeaSheet sheet={sheet} cities={[...groups.keys()]} />
    </div>
  );
}

const Schema = z.object({
  city: optionalText(80),
  hotel: requiredText("Hotel", 120),
  room: optionalText(120),
  nights: optionalNumber({ min: 0, max: 365, int: true }),
  total: optionalNumber({ min: 0 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

function HotelIdeaSheet({ sheet, cities }: { sheet: ReturnType<typeof useSheet<Idea>>; cities: string[] }) {
  const trip = useTrip();
  const insert = useInsertRow("hotel_ideas", "hotel idea");
  const update = useUpdateRow("hotel_ideas", "hotel idea");
  const remove = useDeleteRow("hotel_ideas", "hotel idea");
  const [keepAdding, setKeepAdding] = useState(false);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      city: str(r?.city),
      hotel: r?.hotel ?? "",
      room: str(r?.room),
      nights: str(r?.nights),
      total: str(r?.total),
    });
  }, [sheet.open, sheet.row, reset]);

  const [nightsStr, totalStr] = useWatch({ control, name: ["nights", "total"] });
  const ppn = pricePerNight(totalStr ? Number(totalStr.replace(/,/g, "")) : null, nightsStr ? Number(nightsStr) : null);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      const keep = getValues();
      reset({ ...keep, hotel: "", room: "", total: "" });
      setFocus("hotel");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit hotel idea" : "Add hotel idea"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.hotel);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Hotel" error={errors.hotel?.message}>
        {(p) => <Input {...p} {...register("hotel")} autoComplete="off" />}
      </Field>
      <Field label="City" error={errors.city?.message}>
        {(p) => <Input {...p} {...register("city")} list="idea-cities" autoComplete="off" />}
      </Field>
      <datalist id="idea-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Room" error={errors.room?.message}>
        {(p) => <Input {...p} {...register("room")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nights" error={errors.nights?.message}>
          {(p) => <Input {...p} {...register("nights")} type="number" inputMode="numeric" min={0} />}
        </Field>
        <Field label={`Total (${trip.home_currency})`} error={errors.total?.message}>
          {(p) => <Input {...p} {...register("total")} inputMode="decimal" />}
        </Field>
      </div>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {ppn !== null
          ? `${formatMoney(ppn, trip.home_currency)} per night`
          : "Enter nights and total to see the nightly price."}
      </p>
    </RowSheet>
  );
}
