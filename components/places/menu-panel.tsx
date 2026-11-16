"use client";

import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { menuHomePrice } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { useRows, type Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const MenuItemSheet = dynamic(() => import("./menu-item-sheet").then((m) => m.MenuItemSheet), { ssr: false });

type MenuItem = Row<"menu_items">;
export const menuKey = (s: string) => s.trim().toLowerCase();

/** The dishes saved for one restaurant (linked by name), with add and edit for people who can edit. */
export function MenuSection({ restaurant }: { restaurant: string }) {
  const { data: menu = [] } = useRows("menu_items");
  const sheet = useSheet<MenuItem>();
  const items = menu.filter((m) => menuKey(m.restaurant) === menuKey(restaurant));
  return (
    <section aria-label="Menu prices" className="space-y-2">
      <h3 className="flex items-baseline justify-between font-display text-[17px] font-extrabold">
        Menu prices
        <span className="font-sans text-[13px] font-medium text-fg-muted">{items.length}</span>
      </h3>
      <MenuPanel items={items} onEdit={sheet.openEdit} onAdd={sheet.openAdd} />
      {sheet.mounted && <MenuItemSheet sheet={sheet} restaurant={restaurant} />}
    </section>
  );
}

/** Menus saved for restaurants that are not on the board (by name). Shown under the Food filter so none are lost. */
export function OtherMenus({ restaurants }: { restaurants: string[] }) {
  const { data: menu = [] } = useRows("menu_items");
  const sheet = useSheet<MenuItem>();
  const [restaurant, setRestaurant] = useState("");
  const known = new Set(restaurants.map(menuKey));
  const groups = new Map<string, MenuItem[]>();
  for (const m of menu) if (!known.has(menuKey(m.restaurant))) groups.set(menuKey(m.restaurant), [...(groups.get(menuKey(m.restaurant)) ?? []), m]);
  if (groups.size === 0) return null;
  return (
    <Card>
      <CardTitle>Other menus</CardTitle>
      <p className="mt-1 text-sm text-fg-muted">Prices saved for places that aren&rsquo;t on the board.</p>
      {[...groups.values()].map((items) => (
        <div key={menuKey(items[0].restaurant)} className="mt-3">
          <h3 className="mb-1 text-sm font-semibold">{items[0].restaurant}</h3>
          <MenuPanel
            items={items}
            onEdit={(m) => {
              setRestaurant(m.restaurant);
              sheet.openEdit(m);
            }}
            onAdd={() => {
              setRestaurant(items[0].restaurant);
              sheet.openAdd();
            }}
          />
        </div>
      ))}
      {sheet.mounted && <MenuItemSheet sheet={sheet} restaurant={restaurant} />}
    </Card>
  );
}

function MenuPanel({ items, onEdit, onAdd }: { items: MenuItem[]; onEdit: (m: MenuItem) => void; onAdd: () => void }) {
  const trip = useTrip();
  const canEdit = useCanEdit();
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
                <Row
                  edit={canEdit}
                  onClick={() => onEdit(m)}
                  className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-sm"
                  label={`${m.dish}. Edit`}
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
                </Row>
              </li>
            );
          })}
        </ul>
      )}
      <EditOnly>
        <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add dish
        </Button>
      </EditOnly>
    </div>
  );
}

/** A button for people who can edit; a plain block for viewers. */
function Row({
  edit,
  onClick,
  className,
  label,
  children,
}: {
  edit: boolean;
  onClick: () => void;
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  return edit ? (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}
