"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { pricePerNight } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Idea = Row<"hotel_ideas">;

const Schema = z.object({
  city: optionalText(80),
  hotel: requiredText("Hotel", 120),
  room: optionalText(120),
  nights: optionalNumber({ min: 0, max: 365 }),
  total: optionalNumber({ min: 0 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function HotelIdeaSheet({ sheet, cities }: { sheet: ReturnType<typeof useSheet<Idea>>; cities: string[] }) {
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
          {(p) => <Input {...p} {...register("nights")} type="number" inputMode="decimal" min={0} step={0.5} />}
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
