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
import { ArrowUpDown, ArrowUpRight, CalendarPlus, Check, ChevronDown, Ellipsis, GripVertical, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyText } from "@/components/view-only-banner";
import { itineraryProgress, tripLength } from "@/lib/calc";
import { formatDateRange, formatDay, timeRange } from "@/lib/format";
import {
  dayOf,
  dayTotals,
  directionsUrl,
  groupDays,
  insertProblem,
  isStop,
  kindOf,
  planInsert,
  planMove,
  stayMarks,
  type DayGroup,
  type StayMark,
} from "@/lib/itinerary";
import type { Idea } from "@/lib/drafts";
import { useIdeas } from "@/lib/queries/ideas";
import { MapView, type MapStop } from "@/components/map/map-view";
import { useImages, usePhotoUrls } from "@/lib/queries/images";
import { freshCoords, usePlaceRefs } from "@/lib/queries/places";
import { useMoveItems } from "@/lib/queries/itinerary";
import { useDeleteRow, useRows, useUpdateRow } from "@/lib/queries/table";
import { useStays } from "@/lib/queries/stays";
import { useItineraryWeather } from "@/lib/queries/weather";
import { useMedia } from "@/lib/use-media";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { ideaForItem } from "@/lib/activity-details";
import { AddHere } from "./add-here";
import { CategoryMenu } from "./category-menu";
import { MapStopCard } from "./map-stop-card";
import type { ConnectorTarget } from "./connector-sheet";
import { ConnectorRow, DaySplit, StayRow, StopCard } from "./itinerary-entries";
import type { ActivityDefaults, ItineraryItem } from "./itinerary-sheet";
import { StopView } from "./stop-view";

const ItinerarySheet = dynamic(() => import("./itinerary-sheet").then((m) => m.ItinerarySheet), { ssr: false });
const ConnectorSheet = dynamic(() => import("./connector-sheet").then((m) => m.ConnectorSheet), { ssr: false });

type Entry =
  | { kind: "day"; id: string; day: number | null; group: DayGroup }
  | { kind: "mark"; id: string; day: number | null; mark: StayMark }
  | { kind: "item"; id: string; day: number | null; item: ItineraryItem }
  /** A "Plan Day N" button for the first empty day after a planned day that is followed by a later planned day. */
  | { kind: "gap"; id: string; day: number };

/** The dotted outline button that starts a day: asks which kind of activity first. (`ring-0` drops the outline variant's solid ring.) */
function PlanDayButton({ day, onPick, className }: { day: number; onPick: (type?: string) => void; className?: string }) {
  return (
    <CategoryMenu heading={`Plan Day ${day}: which kind of activity first?`} align="center" onPick={onPick}>
      <Button variant="outline" className={cn("ml-[54px] w-[calc(100%-54px)] border-2 border-dashed border-fg-muted/50 ring-0", className)}>
        <CalendarPlus className="size-[18px]" aria-hidden />
        Plan Day {day}
      </Button>
    </CategoryMenu>
  );
}

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
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-50", cover && "relative z-[2] flow-root bg-ground pb-4 after:absolute after:top-full after:left-0 after:h-4 after:w-10 after:bg-ground after:content-['']")}>
      {children(handle)}
    </li>
  );
}

export function Itinerary() {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const { data: items = [], isPending } = useRows("itinerary_items");
  const stays = useStays();
  const weatherOn = useItineraryWeather(items, trip.start_date, trip.end_date);
  const { ideas } = useIdeas();
  const { byIdea: imagesBy } = useImages();
  const refs = usePlaceRefs();
  const removeRow = useDeleteRow("itinerary_items", "activity");
  const urlOf = usePhotoUrls();
  const update = useUpdateRow("itinerary_items", "activity");
  const move = useMoveItems();
  const sheet = useSheet<ItineraryItem>();
  const [defaults, setDefaults] = useState<ActivityDefaults>();
  const [connector, setConnector] = useState<ConnectorTarget | null>(null);
  const [reorder, setReorder] = useState(false);
  const [big, setBig] = useState(false);
  const [pick, setPick] = useState<"all" | number>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [refit, setRefit] = useState(0);
  const [viewing, setViewing] = useState<ItineraryItem | null>(null);
  const wide = useMedia("(min-width: 1024px)");
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
  /** The place an activity reads as: its board idea (with its own category details over it), or a stand-in from its own details. */
  const placeOfItem = (item: ItineraryItem): Idea | undefined =>
    ideaForItem(item, item.source_table && item.source_id ? ideaOf.get(`${item.source_table}:${item.source_id}`) : undefined);
  const progress = itineraryProgress(items);
  const draftCount = ideas.filter((i) => i.decision === "draft").length;
  const cities = [...new Set(items.map((i) => i.city).filter(Boolean) as string[])].sort();
  const editing = canEdit && reorder;

  // One flat list: day dividers, stays and items in order. Dragging an item past a divider is how it changes day.
  // A day with nothing planned (no activity, no stay check-in or check-out) is not shown; it appears once it has something.
  const entries: Entry[] = [];
  const number = new Map<string, number>();
  const planned: number[] = [];
  let n = 0;
  for (const g of groups) {
    if (g.items.length === 0 && !marks.some((x) => x.day === g.day)) continue;
    if (g.day !== null) planned.push(g.day);
    entries.push({ kind: "day", id: `day:${g.day ?? "none"}`, day: g.day, group: g });
    for (const m of marks.filter((x) => x.day === g.day && x.kind === "out")) entries.push({ kind: "mark", id: m.id, day: g.day, mark: m });
    for (const it of g.items) {
      if (isStop(it)) number.set(it.id, ++n);
      entries.push({ kind: "item", id: it.id, day: g.day, item: it });
    }
    for (const m of marks.filter((x) => x.day === g.day && x.kind === "in")) entries.push({ kind: "mark", id: m.id, day: g.day, mark: m });
    // An empty day right after this one, with more planned days further on: offer to plan it (days 3 and on follow once it is planned).
    if (canEdit && !editing && g.day !== null && (len === null || g.day < len) && !groups.some((x) => x.day === g.day! + 1 && (x.items.length > 0 || marks.some((m) => m.day === x.day))) && groups.some((x) => x.day !== null && x.day > g.day! + 1 && (x.items.length > 0 || marks.some((m) => m.day === x.day))))
      entries.push({ kind: "gap", id: `gap:${g.day + 1}`, day: g.day + 1 });
  }
  const nothing = items.length === 0 && marks.length === 0;
  // After the last planned day: start the next one, unless that was the last day of the trip.
  const lastDay = planned.length ? Math.max(...planned) : null;
  const nextDay = lastDay !== null && (len === null || lastDay < len) ? lastDay + 1 : null;
  // The day pills filter the list and the map. Stops keep their numbers from the whole trip.
  const view = typeof pick === "number" && planned.includes(pick) ? pick : "all";
  const shown = view === "all" ? entries : entries.filter((e) => e.day === view);

  // The route: solid stops only (a tentative stop is a draft placeholder), in the order of the list, numbered as in the list.
  // A stop's position is its saved place's coordinates while they are fresh (30 days); a stop without one is counted, not drawn.
  const routeStops: MapStop[] = [];
  let missing = 0;
  for (const e of shown) {
    if (e.kind !== "item" || !isStop(e.item) || e.item.tentative) continue;
    const coords = e.item.source_table && e.item.source_id ? freshCoords(refs.byIdea.get(`${e.item.source_table}:${e.item.source_id}`)) : null;
    if (coords) routeStops.push({ id: e.item.id, name: e.item.activity, label: number.get(e.item.id), ...coords });
    else missing++;
  }
  const directions = directionsUrl(routeStops);

  const addToDay = (day: number | null, type?: string) => {
    setDefaults({ day: day === null ? "" : String(day), type });
    sheet.openAdd();
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = shown.map((x) => x.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const moved = items.find((i) => i.id === active.id);
    if (from < 0 || to < 0 || !moved) return;
    // The day is the nearest divider above the dropped item; the index counts the items between it and the divider.
    const order = arrayMove(shown, from, to);
    const at = order.findIndex((x) => x.id === active.id);
    let toDay: number | null = shown.find((x) => x.kind === "day")?.day ?? null;
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
  const openActivity = (item: ItineraryItem, type?: string) => {
    const day = groups.find((g) => g.items.some((i) => i.id === item.id));
    if (!day) return;
    const index = day.items.findIndex((i) => i.id === item.id) + 1;
    setDefaults({
      day: day.day === null ? "" : String(day.day),
      type,
      plan: planInsert(day.items, index, day.day, start),
      between: { before: item.activity, after: day.items[index]?.activity },
    });
    sheet.openAdd();
  };

  /** An activity's own photos first, then those of the board idea it came from. */
  const imagesOf = (item: ItineraryItem, idea?: Idea) => [...(imagesBy.get(`itinerary_items:${item.id}`) ?? []), ...(idea ? (imagesBy.get(idea.key) ?? []) : [])];

  const renderItem = (item: ItineraryItem, handle: ReactNode) => {
    if (!isStop(item))
      return <ConnectorRow item={item} currency={trip.home_currency} canEdit={canEdit && !editing} onOpen={() => setConnector({ kind: kindOf(item) as "commute" | "buffer", day: item.day, existing: item })} handle={handle} />;
    const idea = placeOfItem(item);
    return (
      <StopCard
        item={item}
        number={number.get(item.id) ?? 0}
        idea={idea}
        images={imagesOf(item, idea)}
        urlOf={urlOf}
        currency={trip.home_currency}
        canEdit={canEdit}
        compact={editing}
        onOpen={() => setViewing(item)}
        onEdit={() => sheet.openEdit(item)}
        onDone={(done) => update.mutate({ id: item.id, patch: { done } })}
        onRemove={() => removeRow(item, `“${item.activity}”`)}
        handle={handle}
      />
    );
  };

  const list = shown.map((e, k) => {
    if (e.kind === "day") {
      const totals = dayTotals(e.group.items);
      const tentative = e.group.items.filter((i) => isStop(i) && i.tentative).length;
      return (
        <SortableRow key={e.id} id={e.id} locked label="day" cover={k === 0}>
          {() => (
            <>
              <DaySplit group={e.group} totals={totals} weather={weatherOn(e.group.date)} />
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
    if (e.kind === "gap") {
      return (
        <SortableRow key={e.id} id={e.id} locked label="plan day">
          {() => <PlanDayButton day={e.day} onPick={(type) => addToDay(e.day, type)} className="mb-4" />}
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
    const nextItem = shown.slice(k + 1).find((x) => x.kind === "item" || x.kind === "day");
    const next = nextItem?.kind === "item" ? nextItem.item : undefined;
    // The "+" belongs to this activity. Never next to an existing commute or rest, while reordering, or for viewers.
    const addAfter = canEdit && !editing && isStop(e.item) && !(next && !isStop(next));
    return [
      <SortableRow key={e.id} id={e.id} locked={!editing} label={e.item.activity}>
        {(handle) => renderItem(e.item, editing ? handle : null)}
      </SortableRow>,
      addAfter && (
        <AddHere
          key={`add-${e.id}`}
          label={e.item.activity}
          onCommute={() => openChooser(e.item, "commute")}
          onRest={() => openChooser(e.item, "buffer")}
          onActivity={(type) => openActivity(e.item, type)}
        />
      ),
    ];
  });

  /** Google Maps directions to a stop from wherever the person is: a browser link, no API call. Null without a position. */
  const directionsFromHere = (it: ItineraryItem): string | null => {
    const c = it.source_table && it.source_id ? freshCoords(refs.byIdea.get(`${it.source_table}:${it.source_id}`)) : null;
    return c ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : null;
  };

  const dayLabelOf = (it: ItineraryItem): string => {
    const d = dayOf(it, start);
    return d === null ? "No day yet" : `Day ${d}${it.on_date ? ` · ${formatDay(it.on_date)}` : ""}`;
  };

  const dayStops = shown.flatMap((e) => (e.kind === "item" && isStop(e.item) ? [e.item] : []));
  const selectedItem = selected ? (dayStops.find((i) => i.id === selected) ?? items.find((i) => i.id === selected && isStop(i))) : undefined;
  const selectedIdea = selectedItem ? placeOfItem(selectedItem) : undefined;

  const dragged = dragging ? items.find((i) => i.id === dragging) : undefined;

  return (
    <div className="-mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-[28px] lg:bg-ground lg:shadow-card">
      <header
        className={cn(
          "relative flex flex-col overflow-hidden bg-[#12392f] px-4 pt-5 pb-14 text-white transition-[min-height] duration-300 ease-out motion-reduce:transition-none dark:bg-[#0f2a24] dark:text-[#e8f0ec] lg:px-8 lg:pt-8 lg:pb-16",
          big ? "min-h-[480px] lg:min-h-[560px]" : view === "all" ? "min-h-[300px] lg:min-h-[340px]" : "min-h-[350px] lg:min-h-[380px]",
        )}
      >
        {/* The route map is the hero: stops numbered as in the list, an arrow on each leg. Ctrl + scroll zooms it; the page still scrolls. */}
        <div className="absolute inset-0">
          <MapView
            stops={routeStops}
            arrows
            requireContent
            interactive
            cooperative
            label="Route through the stops"
            refit={refit}
            selectedId={selected}
            onStopClick={(id) => {
              setSelected(id);
              setBig(true);
            }}
            insets={wide ? { top: 100, right: 40, bottom: 120, left: 40 } : { top: 110, right: 24, bottom: 140, left: 24 }}
          />
        </div>
        {/* The shading under the title fades out when the map is enlarged, and back in when it is reduced. */}
        <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none", big ? "opacity-0" : "opacity-100")} aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-b from-[#12392f] via-[#12392f]/55 to-transparent dark:from-[#0f2a24] dark:via-[#0f2a24]/55 lg:bg-gradient-to-r lg:from-[#12392f] lg:via-[#12392f]/70 lg:to-transparent lg:dark:from-[#0f2a24] lg:dark:via-[#0f2a24]/70" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_0%,color-mix(in_srgb,var(--teal)_38%,transparent),transparent_60%)]" />
        </div>
        <div className="pointer-events-none relative min-w-0 pr-28">
          <h1 className="sr-only">Itinerary</h1>
          <p
            className={cn(
              "font-display leading-[1.05] font-extrabold tracking-tight text-balance transition-[font-size] duration-300 motion-reduce:transition-none",
              big ? "text-[22px] [text-shadow:0_1px_10px_rgb(0_0_0/0.65)] lg:text-[26px]" : "text-[32px] lg:text-[40px]",
            )}
            aria-hidden
          >
            {trip.name}
          </p>
          <p className={cn("mt-1.5 text-sm text-[#b9d6cc]", big && "[text-shadow:0_1px_8px_rgb(0_0_0/0.65)]")}>
            {[len ? `${len} days` : null, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* Upper right of the map: enlarge or reduce it, and the road route in Google Maps (a link, so no API call and no quota). */}
        <div className="absolute top-4 right-4 z-[2] flex gap-2 lg:top-auto lg:right-8">
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Directions"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-[#12392f]/80 px-3 text-[15px] font-bold backdrop-blur-sm lg:px-4"
            >
              <ArrowUpRight className="size-[18px]" strokeWidth={2.6} aria-hidden />
              <span className="hidden lg:inline">Directions</span>
            </a>
          )}
          <button
            type="button"
            aria-pressed={big}
            aria-label={big ? "Reduce map" : "Enlarge map"}
            onClick={() => {
              // Reducing the map closes the open stop card.
              if (big) setSelected(null);
              setBig((v) => !v);
              // Frame the stops again once the hero has finished growing or shrinking.
              window.setTimeout(() => setRefit((r) => r + 1), 360);
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-[#12392f]/80 px-3 text-[15px] font-bold backdrop-blur-sm lg:px-4"
          >
            {big ? <Minimize2 className="size-[18px]" strokeWidth={2.6} aria-hidden /> : <Maximize2 className="size-[18px]" strokeWidth={2.6} aria-hidden />}
            <span className="hidden lg:inline">{big ? "Reduce map" : "Enlarge map"}</span>
          </button>
        </div>
        {/* The days, low in the hero. They filter the list and the map; days with nothing planned aren't listed. */}
        <div className="pointer-events-none relative mt-auto flex gap-2 overflow-x-auto pt-5 [scrollbar-width:none]" role="group" aria-label="Show days">
          {[{ key: "all" as const, label: "All days" }, ...planned.map((d) => ({ key: d, label: `Day ${d}` }))].map((p) => {
            const on = view === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPick(p.key);
                  setSelected(null);
                  setRefit((r) => r + 1);
                }}
                className={cn(
                  "pointer-events-auto inline-flex min-h-11 shrink-0 items-center rounded-full px-[18px] text-[15px] font-bold transition-colors motion-reduce:transition-none",
                  on ? "bg-[#ffb400] text-[#1a1100]" : big ? "bg-[#12392f]/80 text-inherit backdrop-blur-sm" : "bg-white/15 text-inherit",
                )}
              >
                {p.label}
              </button>
            );
          })}
          <Link href="/places" className={cn("pointer-events-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-[18px] text-[15px] font-bold", big ? "bg-[#12392f]/80 backdrop-blur-sm" : "bg-white/15")}>
            Drafts
            {draftCount > 0 && <span className="font-mono text-xs opacity-85">{draftCount}</span>}
          </Link>
        </div>
        {/* One day picked: its activities, in order, with their times. Picking one shows it on the map. */}
        {view !== "all" && dayStops.length > 0 && (
          <div className="pointer-events-none relative flex gap-2 overflow-x-auto pt-2 [scrollbar-width:none]" role="group" aria-label={`Activities on day ${view}`}>
            {dayStops.map((it) => {
              const on = selected === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setSelected(on ? null : it.id);
                    if (!on) setBig(true);
                  }}
                  className={cn(
                    "pointer-events-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-bold transition-colors motion-reduce:transition-none",
                    on ? "bg-[#ffb400] text-[#1a1100]" : big ? "bg-[#12392f]/80 backdrop-blur-sm" : "bg-white/15",
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/25 font-mono text-[11px]">{number.get(it.id)}</span>
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block max-w-[20ch] truncate">{it.activity}</span>
                    {it.at_time && <span className="block text-[11px] font-medium opacity-85">{timeRange(it.at_time, it.duration_min)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {selectedItem && (
          <MapStopCard
            item={selectedItem}
            number={number.get(selectedItem.id) ?? 0}
            idea={selectedIdea}
            images={imagesOf(selectedItem, selectedIdea)}
            urlOf={urlOf}
            currency={trip.home_currency}
            onOpen={() => setViewing(selectedItem)}
            directionsHref={directionsFromHere(selectedItem)}
            dayLabel={dayLabelOf(selectedItem)}
            onClose={() => setSelected(null)}
          />
        )}
      </header>

      <div className="relative z-[1] -mt-8 rounded-t-[28px] bg-ground px-4 pt-5 pb-8 lg:mt-0 lg:rounded-none lg:px-8">
        <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg-muted">{progress.total ? `${progress.done} of ${progress.total} done` : "Nothing planned yet"}</p>
            {missing > 0 && (
              <p className="text-[13px] text-fg-muted">
                {missing} {missing === 1 ? "stop has" : "stops have"} no map position yet.
              </p>
            )}
          </div>
          <EditOnly>
            <div className="flex items-center gap-2">
              {!nothing && (
                <Button size="sm" variant={reorder ? "primary" : "secondary"} aria-pressed={reorder} onClick={() => setReorder((v) => !v)}>
                  {reorder ? <Check className="size-[18px]" strokeWidth={2.8} aria-hidden /> : <ArrowUpDown className="size-[18px]" aria-hidden />}
                  {reorder ? "Done" : "Reorder"}
                </Button>
              )}
              {!reorder && (
                <CategoryMenu heading="Add which kind of activity?" align="end" onPick={(type) => addToDay(null, type)}>
                  <Button size="sm" variant="secondary">
                    <CalendarPlus className="size-4" aria-hidden />
                    Add
                    <ChevronDown className="size-4" aria-hidden />
                  </Button>
                </CategoryMenu>
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
              <CategoryMenu heading="Add which kind of activity?" align="center" onPick={(type) => addToDay(null, type)}>
                <Button className="mt-4">
                  Add the first activity
                  <ChevronDown className="size-4" aria-hidden />
                </Button>
              </CategoryMenu>
            </EditOnly>
          </div>
        ) : (
          <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((x) => x.id)} strategy={verticalListSortingStrategy}>
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
          {canEdit && !editing && nextDay !== null && (view === "all" || view === lastDay) && (
            <PlanDayButton day={nextDay} onPick={(type) => addToDay(nextDay, type)} className="mt-2" />
          )}
          </>
        )}
      </div>

      {sheet.mounted && <ItinerarySheet sheet={sheet} cities={cities} defaults={defaults} />}
      {viewing && (
        <StopView
          item={viewing}
          idea={placeOfItem(viewing)}
          currency={trip.home_currency}
          images={imagesOf(viewing, placeOfItem(viewing))}
          urlOf={urlOf}
          startDate={start}
          canEdit={canEdit}
          onEdit={() => {
            sheet.openEdit(viewing);
            setViewing(null);
          }}
          onDone={(done) => update.mutate({ id: viewing.id, patch: { done } })}
          onRemove={() => removeRow(viewing, `“${viewing.activity}”`)}
          onClose={() => setViewing(null)}
        />
      )}
      {connector && <ConnectorSheet target={connector} onClose={() => setConnector(null)} />}
    </div>
  );
}

