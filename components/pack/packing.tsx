"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { EditOnly } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckButton } from "@/components/ui/check";
import { Select } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { packedProgress } from "@/lib/calc";
import { formatPercent } from "@/lib/format";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { bySort, useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const PackingSheet = dynamic(() => import("./packing-sheet").then((m) => m.PackingSheet), { ssr: false });
export { PackingSheet };

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
              className="size-5 accent-[var(--teal)]"
            />
            Hide packed
          </label>
        )}
        <EditOnly>
          <Button size="sm" variant="secondary" onClick={() => add()} className="ml-auto">
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </EditOnly>
      </div>

      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-fg-muted">Make a list by category: documents, clothes, gadgets…</p>
          <EditOnly>
            <Button className="mt-3" onClick={() => add()}>
              Add the first item
            </Button>
          </EditOnly>
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
                    <h2 className="truncate text-sm font-bold">{cat}</h2>
                    <span className="text-xs text-fg-muted tabular-nums">
                      {p.done}/{p.total}
                    </span>
                  </div>
                  <Progress value={p.percent} label={`${cat} packed`} className="mt-1.5 h-1.5" />
                </div>
                <EditOnly>
                  <Button variant="ghost" size="icon" onClick={() => add(cat)} aria-label={`Add to ${cat}`}>
                    <Plus className="size-5" aria-hidden />
                  </Button>
                </EditOnly>
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
      {sheet.mounted && (
        <PackingSheet
          sheet={sheet}
          categories={categories.filter((c) => c !== NONE)}
          people={people}
          defaults={defaults}
        />
      )}
    </div>
  );
}
