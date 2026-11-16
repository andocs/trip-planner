"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpDown, Check, CalendarPlus, Ellipsis, GripVertical } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RouteMap, StopsCard } from "@/components/home/dashboard";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyText } from "@/components/view-only-banner";
import { itineraryProgress, tripLength } from "@/lib/calc";
import { formatDateRange } from "@/lib/format";
import {
  dayTotals,
  groupDays,
  insertProblem,
  isStop,
  kindOf,
  planInsert,
  planMove,
  stayMarks,
  type DayGroup,
  type InsertPlan,
  type StayMark,
} from "@/lib/itinerary";
import { useIdeas } from "@/lib/queries/ideas";
import { useImages, usePhotoUrls } from "@/lib/queries/images";
import { useMoveItems } from "@/lib/queries/itinerary";
import { useRows, useUpdateRow } from "@/lib/queries/table";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { AddHere } from "./add-here";
import type { ConnectorTarget } from "./connector-sheet";
import { ConnectorRow, DaySplit, StayRow, StopCard } from "./itinerary-entries";
import type { ItineraryItem } from "./itinerary-sheet";

const ItinerarySheet = dynamic(() => import("./itinerary-sheet").then((m) => m.ItinerarySheet), { ssr: false });
const ConnectorSheet = dynamic(() => import("./connector-sheet").then((m) => m.ConnectorSheet), { ssr: false });

type Entry =
  | { kind: "day"; id: string; group: DayGroup }
  | { kind: "mark"; id: string; mark: StayMark }
  | { kind: "item"; id: string; item: ItineraryItem };

/** One row of the list that can be dragged (an item), or can only be dropped next to (a day divider, a stay). */
function SortableRow({ id, locked, label, cover, children }: { id: string; locked: boolean; label: string; /** Hides the dotted line behind this row: the day header at the very top has no line beside it. */ cover?: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    // Dividers and stays can't be picked up, but an item can be dropped past them (that is how it changes day).
    disabled: locked ? { draggable: true } : false,
  });
  const handle = locked ? null : (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${label}`}
      className="-mt-1 -mr-1.5 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-fg-muted hover:bg-surface-2"
    >
      <GripVertical className="size-[22px]" aria-hidden />
    </button>
  );
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-50", cover && "relative z-[2] bg-ground")}>
      {children(handle)}
    </li>
  );
}

export function Itinerary() {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const { data: items = [], isPending } = useRows("itinerary_items");
  const stays = useRows("stays");
  const { ideas } = useIdeas();
  const { byIdea: imagesBy } = useImages();
  const urlOf = usePhotoUrls();
  const update = useUpdateRow("itinerary_items", "activity");
  const move = useMoveItems();
  const sheet = useSheet<ItineraryItem>();
  const [defaults, setDefaults] = useState<{ day?: string; plan?: InsertPlan }>();
  const [connector, setConnector] = useState<ConnectorTarget | null>(null);
  const [reorder, setReorder] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) return <Skeleton className="h-96" />;

  const start = trip.start_date;
  const len = tripLength(start, trip.end_date);
  const groups = groupDays(items, start, len);
  const marks = stayMarks(stays.data ?? [], start);
  const ideaOf = new Map(ideas.map((i) => [i.key, i]));
  const progress = itineraryProgress(items);
  const draftCount = ideas.filter((i) => i.decision === "draft").length;
  const cities = [...new Set(items.map((i) => i.city).filter(Boolean) as string[])].sort();
  const editing = canEdit && reorder;

  // One flat list: day dividers, stays and items in order. Dragging an item past a divider is how it changes day.
  const entries: Entry[] = [];
  const number = new Map<string, number>();
  let n = 0;
  for (const g of groups) {
    entries.push({ kind: "day", id: `day:${g.day ?? "none"}`, group: g });
    for (const m of marks.filter((x) => x.day === g.day && x.kind === "out")) entries.push({ kind: "mark", id: m.id, mark: m });
    for (const it of g.items) {
      if (isStop(it)) number.set(it.id, ++n);
      entries.push({ kind: "item", id: it.id, item: it });
    }
    for (const m of marks.filter((x) => x.day === g.day && x.kind === "in")) entries.push({ kind: "mark", id: m.id, mark: m });
  }
  const nothing = items.length === 0 && marks.length === 0;

  const addToDay = (day: number | null) => {
    setDefaults({ day: day === null ? "" : String(day) });
    sheet.openAdd();
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = entries.map((x) => x.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const moved = items.find((i) => i.id === active.id);
    if (from < 0 || to < 0 || !moved) return;
    // The day is the nearest divider above the dropped item; the index counts the items between it and the divider.
    const order = arrayMove(entries, from, to);
    const at = order.findIndex((x) => x.id === active.id);
    let toDay: number | null = groups[0]?.day ?? null;
    let index = 0;
    for (let k = 0; k < at; k++) {
      const x = order[k];
      if (x.kind === "day") {
        toDay = x.group.day;
        index = 0;
      } else if (x.kind === "item") index++;
    }
    const result = planMove(items, moved.id, toDay, index, start);
    if (!result.ok) return void toast.error(result.reason);
    move.mutate(result.updates);
  };

  /** Add a commute or a rest right after `item`; refused where the connector rules don't allow it. */
  const openChooser = (item: ItineraryItem, kind: "commute" | "buffer") => {
    const day = groups.find((g) => g.items.some((i) => i.id === item.id));
    if (!day) return;
    const index = day.items.findIndex((i) => i.id === item.id) + 1;
    const problem = insertProblem(day.items, index, kind);
    if (problem) return void toast.error(problem);
    setConnector({ kind, day: day.day, plan: planInsert(day.items, index, day.day, start) });
  };

  /** Add an activity right after `item`, on the same day. */
  const openActivity = (item: ItineraryItem) => {
    const day = groups.find((g) => g.items.some((i) => i.id === item.id));
    if (!day) return;
    const index = day.items.findIndex((i) => i.id === item.id) + 1;
    setDefaults({ day: day.day === null ? "" : String(day.day), plan: planInsert(day.items, index, day.day, start) });
    sheet.openAdd();
  };

  const renderItem = (item: ItineraryItem, handle: ReactNode, next: ItineraryItem | undefined) => {
    if (!isStop(item))
      return <ConnectorRow item={item} currency={trip.home_currency} canEdit={canEdit && !editing} onOpen={() => setConnector({ kind: kindOf(item) as "commute" | "buffer", day: item.day, existing: item })} handle={handle} />;
    const idea = item.source_table && item.source_id ? ideaOf.get(`${item.source_table}:${item.source_id}`) : undefined;
    // Never next to an existing commute or rest, while reordering, or for viewers.
    const addAfter = canEdit && !editing && !(next && !isStop(next));
    return (
      <StopCard
        item={item}
        number={number.get(item.id) ?? 0}
        idea={idea}
        images={idea ? (imagesBy.get(idea.key) ?? []) : []}
        urlOf={urlOf}
        currency={trip.home_currency}
        canEdit={canEdit}
        compact={editing}
        onOpen={() => sheet.openEdit(item)}
        onDone={(done) => update.mutate({ id: item.id, patch: { done } })}
        handle={handle}
      >
        {addAfter && (
          <AddHere
            label={item.activity}
            onCommute={() => openChooser(item, "commute")}
            onRest={() => openChooser(item, "buffer")}
            onActivity={() => openActivity(item)}
          />
        )}
      </StopCard>
    );
  };

  const list = entries.map((e, k) => {
    if (e.kind === "day") {
      const totals = dayTotals(e.group.items);
      const stops = e.group.items.filter((i) => isStop(i) && !i.tentative).length;
      const tentative = e.group.items.filter((i) => isStop(i) && i.tentative).length;
      return (
        <SortableRow key={e.id} id={e.id} locked label="day" cover={k === 0}>
          {() => (
            <>
              <DaySplit group={e.group} totals={totals} stops={stops + tentative} onAdd={canEdit && !editing ? () => addToDay(e.group.day) : undefined} />
              {tentative > 0 && !editing && (
                <p className="mb-4 ml-[54px] text-[13px] text-fg-muted">
                  {tentative} tentative {tentative === 1 ? "stop isn’t" : "stops aren’t"} in this day’s count or the export until confirmed on the board.
                </p>
              )}
            </>
          )}
        </SortableRow>
      );
    }
    if (e.kind === "mark") {
      const status = (stays.data ?? []).find((s) => s.id === e.mark.stayId)?.status ?? "";
      return (
        <SortableRow key={e.id} id={e.id} locked label="stay">
          {() => <StayRow mark={e.mark} status={status} />}
        </SortableRow>
      );
    }
    const nextItem = entries.slice(k + 1).find((x) => x.kind === "item" || x.kind === "day");
    const next = nextItem?.kind === "item" ? nextItem.item : undefined;
    return (
      <SortableRow key={e.id} id={e.id} locked={!editing} label={e.item.activity}>
        {(handle) => renderItem(e.item, editing ? handle : null, next)}
      </SortableRow>
    );
  });

  const dragged = dragging ? items.find((i) => i.id === dragging) : undefined;

  return (
    <div className="-mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-[28px] lg:bg-ground lg:shadow-card">
      <header className="relative overflow-hidden bg-[#12392f] px-4 pt-5 pb-14 text-white dark:bg-[#0f2a24] dark:text-[#e8f0ec] lg:px-8 lg:pt-8 lg:pb-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_0%,color-mix(in_srgb,var(--teal)_38%,transparent),transparent_60%)]" aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="sr-only">Itinerary</h1>
            <p className="font-display text-[32px] leading-[1.05] font-extrabold tracking-tight text-balance lg:text-[40px]" aria-hidden>
              {trip.name}
            </p>
            <p className="mt-1.5 text-sm text-[#b9d6cc]">{[len ? `${len} days` : null, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="relative mt-5 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Itinerary view">
          <span aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-[#ffb400] px-[18px] text-[15px] font-bold text-[#1a1100]">
            Itinerary
          </span>
          <button
            type="button"
            aria-pressed={showMap}
            onClick={() => setShowMap((v) => !v)}
            className={cn("inline-flex min-h-11 items-center rounded-full px-[18px] text-[15px] font-bold", showMap ? "bg-[#ffb400] text-[#1a1100]" : "bg-white/15 text-inherit")}
          >
            Map
          </button>
          <Link href="/places" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-[18px] text-[15px] font-bold">
            Drafts
            {draftCount > 0 && <span className="font-mono text-xs opacity-85">{draftCount}</span>}
          </Link>
        </div>
      </header>

      <div className="relative z-[1] -mt-8 rounded-t-[28px] bg-ground px-4 pt-5 pb-8 lg:mt-0 lg:rounded-none lg:px-8">
        {showMap && (
          // The map (and the one Google map load it costs) only appears when asked for.
          <div className="mb-5 space-y-3">
            <Card className="p-3">
              <div className="relative h-[220px] overflow-hidden rounded-2xl bg-[var(--sea)]">
                <RouteMap bottomInset={40} />
              </div>
            </Card>
            <StopsCard />
          </div>
        )}

        <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
          <p className="text-sm font-bold text-fg-muted">{progress.total ? `${progress.done} of ${progress.total} done` : "Nothing planned yet"}</p>
          <EditOnly>
            <div className="flex items-center gap-2">
              {!nothing && (
                <Button size="sm" variant={reorder ? "primary" : "secondary"} aria-pressed={reorder} onClick={() => setReorder((v) => !v)}>
                  {reorder ? <Check className="size-[18px]" strokeWidth={2.8} aria-hidden /> : <ArrowUpDown className="size-[18px]" aria-hidden />}
                  {reorder ? "Done" : "Reorder"}
                </Button>
              )}
              {!reorder && (
                <Button size="sm" variant="secondary" onClick={() => addToDay(null)}>
                  <CalendarPlus className="size-4" aria-hidden />
                  Add
                </Button>
              )}
            </div>
          </EditOnly>
        </div>

        {editing && (
          <p className="mb-4 flex items-start gap-2 text-[13px] text-fg-muted">
            <GripVertical className="mt-0.5 size-4 shrink-0" aria-hidden />
            Drag the handle to reorder, or drop a place past a day divider to move it to another day. With a keyboard: focus the handle, press space, then the arrow keys.
          </p>
        )}

        {nothing ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="font-semibold">Plan your days</p>
            <p className="mt-1 text-sm text-fg-muted">
              <EmptyText>Add places and pick a day for each; they&rsquo;re grouped by day.</EmptyText>
            </p>
            <EditOnly>
              <Button className="mt-4" onClick={() => addToDay(null)}>
                Add the first activity
              </Button>
            </EditOnly>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
            <SortableContext items={entries.map((x) => x.id)} strategy={verticalListSortingStrategy}>
              <ol className="relative before:absolute before:top-6 before:bottom-6 before:left-[19px] before:border-l-[3px] before:border-dotted before:border-line-strong">{list}</ol>
            </SortableContext>
            <DragOverlay>
              {dragged ? (
                <div className="rounded-2xl bg-surface px-4 py-3 shadow-float ring-2 ring-teal">
                  <p className="flex items-center gap-2 font-display text-lg font-extrabold">
                    <Ellipsis className="size-4 text-fg-muted" aria-hidden />
                    {dragged.activity}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {sheet.mounted && <ItinerarySheet sheet={sheet} cities={cities} defaults={defaults} />}
      {connector && <ConnectorSheet target={connector} onClose={() => setConnector(null)} />}
    </div>
  );
}

