"use client";

import { Plus } from "lucide-react";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow } from "@/components/ui/swipe-row";
import { pricePerNight } from "@/lib/calc";
import { formatMoney } from "@/lib/format";
import { useDeleteRow, useRows, type Row } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const HotelIdeaSheet = dynamic(() => import("./hotel-idea-sheet").then((m) => m.HotelIdeaSheet), { ssr: false });

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
      {sheet.mounted && <HotelIdeaSheet sheet={sheet} cities={[...groups.keys()]} />}
    </div>
  );
}
