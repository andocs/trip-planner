"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckButton } from "@/components/ui/check";
import { Field, Input, Select } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { packedProgress } from "@/lib/calc";
import { formatPercent } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalText, requiredText, str } from "@/lib/schemas";
import { bySort, useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

type Item = Row<"packing_items">;
const ALL = "__all";
const NONE = "Uncategorised";

export function Packing() {
  const { data: items = [], isPending } = useRows("packing_items");
  const { data: travelers = [] } = useRows("travelers", bySort);
  const update = useUpdateRow("packing_items", "packing item");
  const remove = useDeleteRow("packing_items", "packing item");
  const sheet = useSheet<Item>();
  const [whose, setWhose] = useState(ALL);
  const [hidePacked, setHidePacked] = useState(false);
  const [defaults, setDefaults] = useState<{ category?: string }>();

  if (isPending) return <Skeleton className="h-64" />;

  const people = [
    ...new Set([...travelers.map((t) => t.name), ...(items.map((i) => i.whose).filter(Boolean) as string[])]),
  ];
  const categories = [...new Set(items.map((i) => i.category ?? NONE))];
  const overall = packedProgress(items);
  const shown = items.filter((i) => (whose === ALL || i.whose === whose) && (!hidePacked || !i.packed));

  const add = (category?: string) => {
    setDefaults(category ? { category: category === NONE ? "" : category } : undefined);
    sheet.openAdd();
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">
            {overall.done} of {overall.total} packed
          </p>
          <p className="text-sm text-fg-muted tabular-nums">{formatPercent(overall.percent)}</p>
        </div>
        <Progress value={overall.percent} label="Packed" className="mt-2" />
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        {items.length > 0 && (
          <Select
            value={whose}
            onChange={(e) => setWhose(e.target.value)}
            aria-label="Filter by whose"
            className="min-h-11 w-auto flex-1 text-sm"
          >
            <option value={ALL}>Everyone&rsquo;s</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
        {items.length > 0 && (
          <label className="flex min-h-11 items-center gap-2 px-1 text-sm font-medium">
            <input
              type="checkbox"
              checked={hidePacked}
              onChange={(e) => setHidePacked(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
            Hide packed
          </label>
        )}
        <Button size="sm" variant="secondary" onClick={() => add()} className="ml-auto">
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-fg-muted">Make a list by category: documents, clothes, gadgets…</p>
          <Button className="mt-3" onClick={() => add()}>
            Add the first item
          </Button>
        </Card>
      ) : (
        categories.map((cat) => {
          const all = items.filter((i) => (i.category ?? NONE) === cat);
          const list = shown.filter((i) => (i.category ?? NONE) === cat);
          if (list.length === 0) return null;
          const p = packedProgress(all);
          return (
            <section key={cat} aria-label={cat} className="rounded-2xl border border-border bg-surface shadow-card">
              <header className="flex items-center gap-3 border-b border-border py-1 pr-1 pl-4">
                <div className="min-w-0 flex-1 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-sm font-bold">{cat}</h3>
                    <span className="text-xs text-fg-muted tabular-nums">
                      {p.done}/{p.total}
                    </span>
                  </div>
                  <Progress value={p.percent} label={`${cat} packed`} className="mt-1.5 h-1.5" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => add(cat)} aria-label={`Add to ${cat}`}>
                  <Plus className="size-5" aria-hidden />
                </Button>
              </header>
              <ul className="p-2">
                {list.map((i) => (
                  <SwipeRow
                    key={i.id}
                    label={`${i.item}${i.whose ? ` (${i.whose})` : ""}. Edit`}
                    onOpen={() => sheet.openEdit(i)}
                    onSwipeDelete={() => remove(i, i.item)}
                    leading={
                      <CheckButton
                        checked={i.packed}
                        onChange={(packed) => update.mutate({ id: i.id, patch: { packed } })}
                        label={`Packed: ${i.item}${i.whose ? ` (${i.whose})` : ""}`}
                        className="ml-1"
                      />
                    }
                  >
                    <span className={cn("min-w-0 flex-1 font-medium", i.packed && "text-fg-muted line-through")}>
                      {i.item}
                    </span>
                    {i.whose && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg-muted ring-1 ring-border">
                        {i.whose}
                      </span>
                    )}
                  </SwipeRow>
                ))}
              </ul>
            </section>
          );
        })
      )}
      <PackingSheet
        sheet={sheet}
        categories={categories.filter((c) => c !== NONE)}
        people={people}
        defaults={defaults}
      />
    </div>
  );
}

const Schema = z.object({
  item: requiredText("Item", 120),
  category: optionalText(60),
  whose: optionalText(40),
  packed: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function PackingSheet({
  sheet,
  categories,
  people,
  defaults,
}: {
  sheet: ReturnType<typeof useSheet<Item>>;
  categories: string[];
  people: string[];
  defaults?: Partial<In>;
}) {
  const insert = useInsertRow("packing_items", "packing item");
  const update = useUpdateRow("packing_items", "packing item");
  const remove = useDeleteRow("packing_items", "packing item");
  const [keepAdding, setKeepAdding] = useState(true);
  const { register, handleSubmit, reset, formState, control, getValues, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      item: r?.item ?? "",
      category: str(r?.category),
      whose: str(r?.whose),
      packed: r?.packed ?? false,
      ...(r ? {} : defaults),
    });
  }, [sheet.open, sheet.row, reset, defaults]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v }]);
    if (keepAdding) {
      reset({ ...getValues(), item: "", packed: false });
      setFocus("item");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit item" : "Add packing item"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.item);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Item" error={errors.item?.message}>
        {(p) => <Input {...p} {...register("item")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.category?.message}>
          {(p) => <Input {...p} {...register("category")} list="pack-cats" autoComplete="off" />}
        </Field>
        <Field label="Whose" error={errors.whose?.message}>
          {(p) => <Input {...p} {...register("whose")} list="pack-people" autoComplete="off" placeholder="Shared" />}
        </Field>
      </div>
      <datalist id="pack-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="pack-people">
        {people.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Controller
        control={control}
        name="packed"
        render={({ field }) => (
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
            Packed
          </label>
        )}
      />
    </RowSheet>
  );
}
