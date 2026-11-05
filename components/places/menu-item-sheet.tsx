"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { menuHomePrice } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type MenuItem = Row<"menu_items">;

const Schema = z.object({
  restaurant: requiredText("Restaurant", 120),
  dish: requiredText("Dish", 160),
  price_foreign: optionalNumber({ min: 0 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function MenuItemSheet({
  sheet,
  restaurant,
}: {
  sheet: ReturnType<typeof useSheet<MenuItem>>;
  restaurant: string;
}) {
  const trip = useTrip();
  const insert = useInsertRow("menu_items", "menu item");
  const update = useUpdateRow("menu_items", "menu item");
  const remove = useDeleteRow("menu_items", "menu item");
  const [keepAdding, setKeepAdding] = useState(true);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({ restaurant: r?.restaurant ?? restaurant, dish: r?.dish ?? "", price_foreign: str(r?.price_foreign) });
  }, [sheet.open, sheet.row, reset, restaurant]);

  const priceStr = useWatch({ control, name: "price_foreign" });
  const price = priceStr ? Number(priceStr.replace(/,/g, "")) : null;
  const home = price !== null && Number.isFinite(price) ? menuHomePrice(price, trip.rate) : null;

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      reset({ ...getValues(), dish: "", price_foreign: "" });
      setFocus("dish");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit dish" : "Add dish"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.dish);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Restaurant" error={errors.restaurant?.message}>
        {(p) => <Input {...p} {...register("restaurant")} autoComplete="off" />}
      </Field>
      <Field label="Dish" error={errors.dish?.message}>
        {(p) => <Input {...p} {...register("dish")} autoComplete="off" />}
      </Field>
      <Field
        label={`Price (${trip.foreign_currency})`}
        error={errors.price_foreign?.message}
        hint={home !== null ? `≈ ${formatMoney(home, trip.home_currency)}` : undefined}
      >
        {(p) => <Input {...p} {...register("price_foreign")} inputMode="decimal" />}
      </Field>
    </RowSheet>
  );
}
