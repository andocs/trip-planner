"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { List, ListButton } from "@/components/ui/list";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, requiredText, str } from "@/lib/schemas";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";

export const MAX_CATEGORIES = 8;

const Schema = z.object({ name: requiredText("Name", 40), planned: optionalNumber({ min: 0 }) });
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
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
      <CategorySheet sheet={sheet} sort={nextSort(cats)} />
    </Card>
  );
}

/** Edit a category's name and planned amount. Also used from the Spend tab. */
export function CategorySheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Category>>; sort: number }) {
  const trip = useTrip();
  const insert = useInsertRow("categories", "category");
  const update = useUpdateRow("categories", "category");
  const remove = useDeleteRow("categories", "category");
  const { register, handleSubmit, reset, formState } = useForm<In, unknown, Out>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    if (sheet.open) reset({ name: sheet.row?.name ?? "", planned: str(sheet.row?.planned) });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v, sort }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit category" : "Add category"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.name);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Name" error={formState.errors.name?.message}>
        {(p) => <Input {...p} {...register("name")} autoComplete="off" />}
      </Field>
      <Field
        label={`Planned (${trip.home_currency})`}
        error={formState.errors.planned?.message}
        hint="Leave blank if you haven't planned this one."
      >
        {(p) => <Input {...p} {...register("planned")} inputMode="decimal" placeholder="0.00" />}
      </Field>
    </RowSheet>
  );
}
