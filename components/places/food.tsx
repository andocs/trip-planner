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
import { menuHomePrice } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";
import { PlaceList, type Place } from "./place-list";

type MenuItem = Row<"menu_items">;
const key = (s: string) => s.trim().toLowerCase();

export function Food() {
  const { data: menu = [] } = useRows("menu_items");
  const { data: places = [] } = useRows("food_places");
  const updateMenu = useUpdateRow("menu_items", "menu item");
  const sheet = useSheet<MenuItem>();
  const [restaurant, setRestaurant] = useState("");

  const byRestaurant = new Map<string, MenuItem[]>();
  for (const m of menu) byRestaurant.set(key(m.restaurant), [...(byRestaurant.get(key(m.restaurant)) ?? []), m]);
  const placeKeys = new Set(places.map((p) => key(p.name)));
  const orphans = [...byRestaurant.entries()].filter(([k]) => !placeKeys.has(k));

  const addFor = (name: string) => {
    setRestaurant(name);
    sheet.openAdd();
  };

  return (
    <div className="space-y-4">
      <PlaceList
        table="food_places"
        noun="food place"
        emptyHint="Save restaurants and street-food spots you want to try."
        panelLabel={(p) => `Menu for ${p.name} (${byRestaurant.get(key(p.name))?.length ?? 0} dishes)`}
        renderPanel={(p: Place) => (
          <MenuPanel items={byRestaurant.get(key(p.name)) ?? []} onEdit={sheet.openEdit} onAdd={() => addFor(p.name)} />
        )}
        onRenamed={(from, to) => {
          // Menu items are linked by restaurant name, so carry them over on rename.
          for (const m of byRestaurant.get(key(from)) ?? []) updateMenu.mutate({ id: m.id, patch: { restaurant: to } });
        }}
      />
      {orphans.length > 0 && (
        <Card>
          <CardTitle>Other menus</CardTitle>
          <p className="mt-1 text-sm text-fg-muted">Prices saved for places that aren&rsquo;t in your list.</p>
          {orphans.map(([k, items]) => (
            <div key={k} className="mt-3">
              <h3 className="mb-1 text-sm font-semibold">{items[0].restaurant}</h3>
              <MenuPanel items={items} onEdit={sheet.openEdit} onAdd={() => addFor(items[0].restaurant)} />
            </div>
          ))}
        </Card>
      )}
      <MenuItemSheet sheet={sheet} restaurant={restaurant} />
    </div>
  );
}

function MenuPanel({ items, onEdit, onAdd }: { items: MenuItem[]; onEdit: (m: MenuItem) => void; onAdd: () => void }) {
  const trip = useTrip();
  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">No menu prices yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m) => {
            const home = menuHomePrice(m.price_foreign, trip.rate);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onEdit(m)}
                  className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-sm"
                  aria-label={`${m.dish}. Edit`}
                >
                  <span className="min-w-0 flex-1">{m.dish}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    {m.price_foreign !== null ? (
                      <>
                        <span className="block font-semibold">
                          {formatMoney(m.price_foreign, trip.foreign_currency)}
                        </span>
                        <span className="block text-xs text-fg-muted">≈ {formatMoney(home, trip.home_currency)}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">–</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={onAdd}>
        <Plus className="size-4" aria-hidden />
        Add dish
      </Button>
    </div>
  );
}

const Schema = z.object({
  restaurant: requiredText("Restaurant", 120),
  dish: requiredText("Dish", 160),
  price_foreign: optionalNumber({ min: 0 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

function MenuItemSheet({ sheet, restaurant }: { sheet: ReturnType<typeof useSheet<MenuItem>>; restaurant: string }) {
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
