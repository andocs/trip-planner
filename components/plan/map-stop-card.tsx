"use client";

import { BedDouble, Landmark, Timer, Utensils, X, type LucideIcon } from "lucide-react";
import { CHIP_ICONS } from "@/components/ideas/idea-chips";
import { PhotoImg } from "@/components/photos/photo-img";
import { PlaceLinks } from "@/components/ui/place-links";
import type { Idea } from "@/lib/drafts";
import { timeRange } from "@/lib/format";
import { parseDetails } from "@/lib/idea-details";
import { stopLinks } from "@/lib/itinerary";
import { stopRows } from "@/lib/itinerary-rows";
import type { ImageRow } from "@/lib/queries/images";
import type { Row } from "@/lib/queries/table";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, LucideIcon> = { stay: BedDouble, food: Utensils, sight: Landmark };

/**
 * The card at the right of the itinerary map for the stop whose pin was picked: its photo with the stop number and type,
 * the day and area, the time range, the facts that matter, links as chips, and two actions.
 */
export function MapStopCard({
  item,
  number,
  idea,
  images,
  urlOf,
  currency,
  dayLabel,
  directionsHref,
  onOpen,
  onClose,
}: {
  item: Row<"itinerary_items">;
  number: number;
  idea?: Idea;
  images: ImageRow[];
  urlOf: (r: ImageRow) => string | null;
  currency: string;
  /** "Day 1 · Tue 16 Jun". */
  dayLabel: string;
  /** Google Maps directions to this stop (a browser link), or null when it has no map position. */
  directionsHref: string | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  // The time is the headline; the rest of the rows (cost, the one fact that matters, area) are the facts.
  const facts = stopRows(item, idea, currency).slice(1, 4);
  const own = stopLinks(item.details);
  const fromIdea = idea ? parseDetails(idea.kind, idea.details) : {};
  const range = timeRange(item.at_time, item.duration_min);
  const cover = images[0];
  const Kind = KIND_ICON[idea?.kind ?? "sight"] ?? Landmark;
  return (
    <aside
      aria-label={`${item.activity}, selected stop`}
      className="pointer-events-auto absolute top-[7rem] right-4 z-[3] flex max-h-[calc(100%-8rem)] w-[min(300px,calc(100%-2rem))] flex-col overflow-hidden rounded-[20px] bg-surface text-fg shadow-float lg:right-8"
    >
      <div className="relative h-28 shrink-0 bg-gradient-to-br from-[#7fb4a5] to-[#2f6b5c]">
        {cover ? (
          <PhotoImg src={urlOf(cover)} alt={`Photo of ${item.activity}`} className="absolute inset-0 size-full object-cover" />
        ) : (
          <Kind className="absolute right-4 bottom-3 size-12 text-white/45" strokeWidth={1.5} aria-hidden />
        )}
        <span className="absolute top-3 left-3 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs font-bold text-fg shadow-float">
          <b className="font-mono">{number}</b>
          {item.type ?? "Stop"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-1 right-1 grid size-11 place-items-center rounded-full text-white"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[rgb(8_26_22/0.6)]">
            <X className="size-5" aria-hidden />
          </span>
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pt-3.5">
        <p className="text-xs font-bold text-fg-muted">{[dayLabel, item.city].filter(Boolean).join(" · ")}</p>
        <h3 className="font-display text-[21px] leading-[1.12] font-extrabold tracking-tight text-balance">{item.activity}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
          <Timer className="size-4 text-teal" strokeWidth={2.4} aria-hidden />
          {range || "Any time"}
          {item.tentative && <span className="ml-auto inline-flex min-h-6 items-center rounded-full bg-warn-tint px-2 text-[11px] font-extrabold text-warn-text">Tentative</span>}
          {item.done && <span className="ml-auto inline-flex min-h-6 items-center rounded-full bg-teal-tint px-2 text-[11px] font-extrabold text-teal">Done</span>}
        </p>
        {facts.length > 0 && (
          <ul className="mt-3 border-t border-border">
            {facts.map((r) => {
              const Icon = CHIP_ICONS[r.icon] ?? Timer;
              return (
                <li key={r.label} className="grid min-h-11 grid-cols-[22px_1fr] items-center gap-2.5 border-b border-border py-1 text-sm last:border-b-0">
                  <Icon className={cn("size-[18px]", r.tone === "warn" ? "text-warn-text" : "text-teal")} strokeWidth={2.4} aria-hidden />
                  <span className="min-w-0">
                    <b className={cn("block truncate leading-tight", r.tone === "warn" && "text-warn-text")}>{r.value}</b>
                    <small className="block text-xs text-fg-muted">{r.label}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <PlaceLinks website={own.website ?? fromIdea.website} mapsUrl={own.mapsUrl ?? fromIdea.mapsUrl} compact className="flex flex-wrap gap-x-4 pt-1" />
      </div>
      <div className="flex shrink-0 gap-2 p-4 pt-2">
        {directionsHref && (
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-extrabold hover:bg-surface-2"
          >
            Directions
          </a>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-fg hover:bg-primary/90"
        >
          View details
        </button>
      </div>
    </aside>
  );
}
