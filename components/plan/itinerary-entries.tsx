"use client";

import {
  ArrowUpRight,
  BedDouble,
  Bike,
  Bus,
  CalendarDays,
  Car,
  ChevronRight,
  Coffee,
  Footprints,
  Hourglass,
  Landmark,
  LogIn,
  Plane,
  Timer,
  TriangleAlert,
  Train,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CHIP_ICONS, MustFlag } from "@/components/ideas/idea-chips";
import { PhotoImg } from "@/components/photos/photo-img";
import { CheckButton } from "@/components/ui/check";
import { formatDay, formatDuration, formatMoney } from "@/lib/format";
import { KIND_LABEL, type Idea } from "@/lib/drafts";
import { connectorDetails, connectorLabel, formatTotal, kindOf, type DayGroup, type DayTotals, type StayMark } from "@/lib/itinerary";
import { stopRows } from "@/lib/itinerary-rows";
import { creditText } from "@/lib/photos/shared";
import type { ImageRow } from "@/lib/queries/images";
import type { Row } from "@/lib/queries/table";
import { cn } from "@/lib/utils";

type Item = Row<"itinerary_items">;
const KIND_ICON: Record<string, LucideIcon> = { stay: BedDouble, food: Utensils, sight: Landmark };
const MODE_ICON: Record<string, LucideIcon> = { walk: Footprints, taxi: Car, bus: Bus, train: Train, motorbike: Bike, flight: Plane };
const BUFFER_ICON: Record<string, LucideIcon> = { rest: Coffee, meal: Utensils, waiting: Hourglass, "check-in/out": LogIn };

/** The numbered circle on the dotted line. */
function Node({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "stay" | "tentative" }) {
  return (
    <span
      className={cn(
        "relative z-[1] mt-4 grid size-10 place-items-center rounded-full font-mono text-[15px] font-bold shadow-[0_0_0_5px_var(--ground)]",
        tone === "ink" && "bg-ink text-ground",
        tone === "stay" && "bg-[var(--chart-3)] text-white",
        tone === "tentative" && "border-2 border-line-strong bg-ground text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}

/** The photo saved on the linked board idea (its cover), else a calm placeholder. */
function Thumb({ item, idea, images, urlOf, small }: { item: Item; idea?: Idea; images: ImageRow[]; urlOf: (r: ImageRow) => string | null; small: boolean }) {
  const Icon = KIND_ICON[idea?.kind ?? "sight"] ?? Landmark;
  const cover = images[0];
  const placeholder = (
    <span className="absolute inset-0 grid place-items-center bg-surface-2 text-fg-muted ring-[1.5px] ring-line-strong ring-inset">
      <span className="flex flex-col items-center gap-1 text-[11px] font-bold">
        <Icon className="size-6" strokeWidth={1.7} aria-hidden />
        {!small && "No photo"}
      </span>
    </span>
  );
  return (
    <div
      className={cn("relative shrink-0 self-stretch overflow-hidden rounded-[14px] bg-surface-2", small ? "size-16 self-center" : "min-h-28 w-[88px] lg:w-36")}
      title={cover ? (creditText(cover) ?? undefined) : undefined}
    >
      {cover ? (
        <PhotoImg src={urlOf(cover)} alt={`Photo of ${item.activity}`} className="absolute inset-0 size-full object-cover" fallback={placeholder} />
      ) : (
        placeholder
      )}
    </div>
  );
}

export function StopCard({
  item,
  number,
  idea,
  images,
  urlOf,
  currency,
  canEdit,
  compact,
  onOpen,
  onDone,
  handle,
  children,
}: {
  item: Item;
  number: number;
  idea?: Idea;
  images: ImageRow[];
  urlOf: (r: ImageRow) => string | null;
  currency: string;
  canEdit: boolean;
  /** Reorder mode: a small photo and one line, so a long day fits on the screen while dragging. */
  compact: boolean;
  onOpen: () => void;
  onDone: (done: boolean) => void;
  handle?: ReactNode;
  children?: ReactNode;
}) {
  const rows = stopRows(item, idea, currency);
  const shown = compact ? rows.slice(0, 1) : rows;
  const type = item.type ?? (idea ? KIND_LABEL[idea.kind] : "Stop");
  const sub = item.note && !/^https?:\/\//i.test(item.note) ? item.note.split("\n")[0] : (item.city ?? "");
  return (
    <div className="group/card grid grid-cols-[40px_1fr] gap-3.5 pb-5">
      <Node tone={item.tentative ? "tentative" : "ink"}>{number}</Node>
      <div className="min-w-0">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs font-bold text-fg-muted">
              <span>{item.at_time ? `${type} · ${item.at_time.slice(0, 5)}` : type}</span>
              {item.tentative && <span className="inline-flex min-h-5 items-center rounded-full px-2 font-sans text-[11px] ring-[1.5px] ring-line-strong">Tentative</span>}
              {idea?.dealBreaker && <MustFlag />}
            </p>
            <h3 className={cn("font-display text-[21px] leading-[1.12] font-extrabold tracking-tight text-balance", item.done && "text-fg-muted line-through")}>
              {item.activity}
            </h3>
            {!compact && sub && <p className="mt-1 line-clamp-1 text-sm text-fg-muted">{sub}</p>}
          </div>
          {canEdit && !compact && !item.tentative && (
            <CheckButton checked={item.done} onChange={onDone} label={`Done: ${item.activity}`} className="-mt-1" />
          )}
          {item.tentative && item.source_id && !compact && (
            // The draft's place on the board: shown when the card is hovered or focused, and always on a touch screen.
            <Link
              href={`/places?idea=${item.source_table}:${item.source_id}`}
              aria-label={`Open ${item.activity} on the board`}
              title="Open on the board"
              className="-mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[inset_0_0_0_1.5px_var(--line)] opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ArrowUpRight className="size-5" strokeWidth={2.4} aria-hidden />
            </Link>
          )}
          {handle ??
            (canEdit ? (
              <button
                type="button"
                onClick={onOpen}
                aria-label={`${item.tentative ? "Tentative: " : ""}${item.activity}. Edit`}
                className="-mt-1 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[inset_0_0_0_1.5px_var(--line)]"
              >
                <ChevronRight className="size-[22px]" strokeWidth={2.4} aria-hidden />
              </button>
            ) : null)}
        </div>
        <div
          className={cn(
            "mt-3 grid items-center gap-3 rounded-[22px] bg-surface p-2.5 shadow-card",
            compact ? "grid-cols-[64px_1fr]" : "grid-cols-[88px_1fr] lg:grid-cols-[9rem_1fr] lg:p-3",
            item.tentative && "border-2 border-dashed border-line-strong bg-transparent shadow-none",
          )}
        >
          <Thumb item={item} idea={idea} images={images} urlOf={urlOf} small={compact} />
          <ul className="min-w-0">
            {shown.map((r, n) => {
              const Icon = CHIP_ICONS[r.icon] ?? Timer;
              return (
                <li key={r.label} className={cn("grid min-h-12 grid-cols-[22px_1fr] items-center gap-2.5 py-1", n > 0 && "border-t border-border")}>
                  <Icon className={cn("size-[18px]", r.tone === "warn" ? "text-warn-text" : r.tone === "ok" ? "text-teal" : "text-teal")} strokeWidth={2.4} aria-hidden />
                  <span className="min-w-0">
                    <b className={cn("block truncate text-sm leading-tight", r.tone === "warn" && "text-warn-text")}>{r.value}</b>
                    <small className="block text-xs text-fg-muted">{r.label}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A commute or a break between two places: the circled icon on the line, its length, cost and note. */
export function ConnectorRow({
  item,
  currency,
  canEdit,
  onOpen,
  handle,
}: {
  item: Item;
  currency: string;
  canEdit: boolean;
  onOpen: () => void;
  handle?: ReactNode;
}) {
  const k = kindOf(item);
  const d = connectorDetails(item.details);
  const Icon = (k === "commute" ? MODE_ICON[d.mode ?? ""] : BUFFER_ICON[d.bufferKind ?? ""]) ?? (k === "commute" ? Car : Timer);
  const ring = k === "commute" ? "var(--chart-3)" : "var(--chart-4)";
  const label = connectorLabel(item);
  const body = (
    <>
      <span
        className="relative z-[1] ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-surface"
        style={{ color: ring, boxShadow: `inset 0 0 0 2px ${ring}, 0 0 0 5px var(--ground)` }}
      >
        <Icon className="size-4" strokeWidth={2.4} aria-hidden />
      </span>
      <span className="min-w-0 text-left text-sm font-bold text-fg-muted">
        {label} · <em className="font-mono font-medium text-fg not-italic">{formatDuration(item.duration_min) || "length not set"}</em>
        {d.cost !== undefined && <small className="ml-2 font-medium">{formatMoney(d.cost, currency)}</small>}
        {d.note && <small className="mt-0.5 block truncate font-medium">{d.note}</small>}
      </span>
    </>
  );
  return (
    <div className="mb-5 grid min-h-11 grid-cols-[40px_1fr_auto] items-center gap-3.5">
      {canEdit && !handle ? (
        <button type="button" onClick={onOpen} aria-label={`${label}, ${formatDuration(item.duration_min)}. Edit`} className="col-span-2 grid grid-cols-subgrid items-center rounded-xl">
          {body}
        </button>
      ) : (
        <div className="col-span-2 grid grid-cols-subgrid items-center">{body}</div>
      )}
      {handle}
    </div>
  );
}

/** A stay on its check-in or check-out day. Worked out from the Stays page, never stored here. */
export function StayRow({ mark, status }: { mark: StayMark; status: string }) {
  return (
    <div className="grid grid-cols-[40px_1fr] gap-3.5 pb-5">
      <Node tone="stay">
        <BedDouble className="size-[18px]" strokeWidth={2.4} aria-hidden />
      </Node>
      <Link href="/stays" className="mt-1 block min-w-0 rounded-2xl py-1">
        <p className="font-mono text-xs font-bold text-fg-muted">{mark.kind === "in" ? "Stay · check in" : "Stay · check out"}</p>
        <p className="font-display text-lg leading-tight font-extrabold tracking-tight">{mark.hotel}</p>
        <p className="text-sm text-fg-muted">{status}</p>
      </Link>
    </div>
  );
}

/** The quiet divider between days: the day, its date (worked out from the trip start), the total and a soft warning. */
/** The day divider, as in the mockup: a centred label with a quiet line either side. No add button here. */
export function DaySplit({ group, totals, stops }: { group: DayGroup; totals: DayTotals; stops: number }) {
  const title = group.day === null ? "Unscheduled" : `Day ${group.day}${group.date ? ` · ${formatDay(group.date)}` : ""}`;
  const summary = stops === 0 ? null : `${stops} ${stops === 1 ? "place" : "places"}${totals.total ? ` · ${formatTotal(totals.total)}` : ""}`;
  return (
    <div role="separator" aria-label={title} className="mb-6 ml-[54px] flex flex-col items-center gap-2">
      <div className="flex w-full items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold text-fg-muted shadow-[inset_0_0_0_1.5px_var(--line)]">
          <CalendarDays className="size-3.5" strokeWidth={2.4} aria-hidden />
          {title}
          {summary && <span className="font-mono font-medium">{summary}</span>}
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      {totals.long && (
        <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-warn-tint px-2.5 text-xs font-bold text-warn-text">
          <TriangleAlert className="size-3.5" strokeWidth={2.6} aria-hidden />
          Long day
        </span>
      )}
    </div>
  );
}
