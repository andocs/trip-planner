"use client";

import { Timer, X } from "lucide-react";
import { CHIP_ICONS } from "@/components/ideas/idea-chips";
import { PhotoImg } from "@/components/photos/photo-img";
import { PlaceLinks } from "@/components/ui/place-links";
import type { Idea } from "@/lib/drafts";
import { parseDetails } from "@/lib/idea-details";
import { stopRows } from "@/lib/itinerary-rows";
import { stopLinks } from "@/lib/itinerary";
import type { ImageRow } from "@/lib/queries/images";
import type { Row } from "@/lib/queries/table";

/** The small card at the right of the itinerary map for the stop whose pin was picked: a photo, when and what, and its links. */
export function MapStopCard({
  item,
  number,
  idea,
  images,
  urlOf,
  currency,
  onOpen,
  onClose,
}: {
  item: Row<"itinerary_items">;
  number: number;
  idea?: Idea;
  images: ImageRow[];
  urlOf: (r: ImageRow) => string | null;
  currency: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const rows = stopRows(item, idea, currency).slice(0, 1);
  const own = stopLinks(item.details);
  const fromIdea = idea ? parseDetails(idea.kind, idea.details) : {};
  const mapsUrl = own.mapsUrl ?? fromIdea.mapsUrl;
  const cover = images[0];
  return (
    <aside
      aria-label={`${item.activity}, selected stop`}
      className="pointer-events-auto absolute top-[9.5rem] right-4 z-[3] w-[min(264px,calc(100%-2rem))] overflow-hidden rounded-2xl bg-surface text-fg shadow-float lg:right-8"
    >
      {cover && (
        <div className="relative h-24 bg-surface-2">
          <PhotoImg src={urlOf(cover)} alt={`Photo of ${item.activity}`} className="absolute inset-0 size-full object-cover" />
        </div>
      )}
      <div className="relative px-3.5 pt-3 pb-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-1 right-1 grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
        >
          <X className="size-5" aria-hidden />
        </button>
        <p className="pr-10 font-mono text-xs font-bold text-fg-muted">
          {number}
          {" · "}
          {item.at_time ? `${item.type ?? "Stop"} · ${item.at_time.slice(0, 5)}` : (item.type ?? "Stop")}
        </p>
        <h3 className="pr-10 font-display text-lg leading-tight font-extrabold tracking-tight">{item.activity}</h3>
        <ul className="mt-1">
          {rows.map((r) => {
            const Icon = CHIP_ICONS[r.icon] ?? Timer;
            return (
              <li key={r.label} className="flex min-h-9 items-center gap-2 text-sm">
                <Icon className="size-4 shrink-0 text-teal" strokeWidth={2.4} aria-hidden />
                <b className="min-w-0 truncate">{r.value}</b>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4">
          <PlaceLinks website={own.website ?? fromIdea.website} mapsUrl={mapsUrl} compact className="contents" />
          <button type="button" onClick={onOpen} className="min-h-9 font-bold text-teal">
            Details
          </button>
        </div>
      </div>
    </aside>
  );
}
