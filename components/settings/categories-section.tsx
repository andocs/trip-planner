"use client";

import { Plus } from "lucide-react";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { List, ListButton } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const CategorySheet = dynamic(() => import("./category-sheet").then((m) => m.CategorySheet), { ssr: false });
export { CategorySheet };

export const MAX_CATEGORIES = 8;

type Category = Row<"categories">;

export function CategoriesSection() {
  const trip = useTrip();
  const { data: cats, isPending } = useRows("categories", bySort);
  const sheet = useSheet<Category>();
  const planned = (cats ?? []).reduce((s, c) => s + Number(c.planned ?? 0), 0);
  const budget = Number(trip.budget);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Budget categories</CardTitle>
        {(cats?.length ?? 0) < MAX_CATEGORIES && (
          <Button variant="ghost" size="sm" onClick={sheet.openAdd}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        )}
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-40" />
      ) : (
        <List className="mt-2">
          {cats?.map((c) => (
            <ListButton
              key={c.id}
              title={c.name}
              trailing={
                <span className="text-sm text-fg-muted tabular-nums">
                  {c.planned === null ? "No plan" : formatMoney(c.planned, trip.home_currency)}
                </span>
              }
              onClick={() => sheet.openEdit(c)}
              label={`Edit ${c.name}`}
            />
          ))}
        </List>
      )}
      <p className="mt-2 text-sm text-fg-muted">
        Planned {formatMoney(planned, trip.home_currency)}
        {budget > 0 && ` of ${formatMoney(budget, trip.home_currency)} budget`}
        {budget > 0 && planned > budget && <span className="font-semibold text-danger"> · over budget</span>}
      </p>
      {sheet.mounted && <CategorySheet sheet={sheet} sort={nextSort(cats)} />}
    </Card>
  );
}
