"use client";

import { MapPinPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyHint, List, ListButton } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const DestinationSheet = dynamic(() => import("./destination-sheet").then((m) => m.DestinationSheet), { ssr: false });
export { DestinationSheet };

type Dest = Row<"destinations">;

export function DestinationsSection() {
  const { data: dests, isPending } = useRows("destinations", bySort);
  const sheet = useSheet<Dest>();
  const totalNights = (dests ?? []).reduce((s, d) => s + d.nights, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Destinations</CardTitle>
        <Button variant="ghost" size="sm" onClick={sheet.openAdd}>
          <MapPinPlus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-14" />
      ) : dests?.length ? (
        <>
          <List className="mt-2">
            {dests.map((d, i) => (
              <ListButton
                key={d.id}
                leading={
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal/15 font-bold text-primary">
                    {i + 1}
                  </span>
                }
                title={[d.city, d.country].filter(Boolean).join(", ")}
                subtitle={`${d.nights} ${d.nights === 1 ? "night" : "nights"}${d.lat === null || d.lng === null ? " · no coordinates" : ""}`}
                onClick={() => sheet.openEdit(d)}
                label={`Edit ${d.city}`}
              />
            ))}
          </List>
          <p className="mt-2 text-sm text-fg-muted">{totalNights} nights in total</p>
        </>
      ) : (
        <EmptyHint>Add the cities you&rsquo;ll stay in, in order. They appear on the map sized by nights.</EmptyHint>
      )}
      {sheet.mounted && <DestinationSheet sheet={sheet} sort={nextSort(dests)} />}
    </Card>
  );
}
