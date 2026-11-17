"use client";

import { ArrowUpRight, CircleCheck, Pencil, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { CHIP_ICONS, MustFlag } from "@/components/ideas/idea-chips";
import { IdeaPhotos } from "@/components/photos/idea-photos";
import { Button } from "@/components/ui/button";
import { PlaceLinks } from "@/components/ui/place-links";
import { Sheet } from "@/components/ui/sheet";
import type { Idea } from "@/lib/drafts";
import { formatDay, formatDuration, timeRange } from "@/lib/format";
import { parseDetails } from "@/lib/idea-details";
import { dayOf, stopLinks } from "@/lib/itinerary";
import { stopRows } from "@/lib/itinerary-rows";
import type { ImageRow } from "@/lib/queries/images";
import type { Row } from "@/lib/queries/table";
import { cn } from "@/lib/utils";

/**
 * A stop, read-only, laid out like the idea sheet: photos, a line of facts, the detail list, links, notes. What a click on
 * a card opens, for everyone. Editors also get Edit details, Mark complete and Remove under it.
 */
export function StopView({
  item,
  idea,
  currency,
  images,
  urlOf,
  startDate,
  canEdit,
  onEdit,
  onDone,
  onRemove,
  onClose,
}: {
  item: Row<"itinerary_items">;
  idea?: Idea;
  currency: string;
  images: ImageRow[];
  urlOf: (r: ImageRow) => string | null;
  startDate: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onDone: (done: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const own = stopLinks(item.details);
  const fromIdea = idea ? parseDetails(idea.kind, idea.details) : {};
  const website = own.website ?? fromIdea.website;
  const mapsUrl = own.mapsUrl ?? fromIdea.mapsUrl;
  const note = item.note && !/^https?:\/\//i.test(item.note) ? item.note : null;
  // The note has its own section below, so it is not repeated as a detail row.
  const rows = stopRows(item, idea, currency).filter((r) => !(note && r.label === "Note"));
  const day = dayOf(item, startDate);
  const when = [day === null ? "No day yet" : `Day ${day}${item.on_date ? ` · ${formatDay(item.on_date)}` : ""}`, timeRange(item.at_time, item.duration_min)].filter(Boolean).join(" · ");
  const status = item.done ? "Done" : item.tentative ? "Tentative" : "Planned";

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.activity}
      description={when}
      className="md:top-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[27.5rem] md:translate-x-0 md:translate-y-0 md:rounded-l-3xl md:rounded-r-none"
    >
      <div className="space-y-5 pt-1">
        {images.length > 0 && <IdeaPhotos idea={{ table: "itinerary_items", id: item.id, key: `itinerary_items:${item.id}`, name: item.activity }} images={images} urlOf={urlOf} canEdit={false} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
          <span
            className={cn(
              "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-extrabold",
              item.tentative ? "bg-warn-tint text-warn-text" : "bg-teal-tint text-teal",
            )}
          >
            {status}
          </span>
          {item.type && <b className="text-fg">{item.type}</b>}
          {item.city && <span>{item.city}</span>}
          {item.duration_min ? <span>{formatDuration(item.duration_min)}</span> : null}
          {idea?.dealBreaker && <MustFlag />}
        </div>

        <section aria-label="Details" className="space-y-2">
          <h3 className="font-display text-[17px] font-extrabold">Details</h3>
          <ul className="overflow-hidden rounded-2xl bg-surface-2">
            {rows.map((r, n) => {
              const Icon = CHIP_ICONS[r.icon] ?? Timer;
              return (
                <li key={r.label} className={cn("grid min-h-14 grid-cols-[22px_1fr] items-center gap-3 px-3.5 py-1.5", n > 0 && "border-t border-border")}>
                  <Icon className={cn("size-[18px]", r.tone === "warn" ? "text-warn-text" : "text-teal")} strokeWidth={2.4} aria-hidden />
                  <span className="min-w-0">
                    <small className="block text-xs text-fg-muted">{r.label}</small>
                    <b className={cn("block text-[15px] leading-tight", r.tone === "warn" && "text-warn-text")}>{r.value}</b>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <PlaceLinks website={website} mapsUrl={mapsUrl} className="-mt-2 flex flex-wrap gap-x-5" />

        {note && (
          <section aria-label="Notes" className="space-y-2">
            <h3 className="font-display text-[17px] font-extrabold">Notes</h3>
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] whitespace-pre-line">{note}</p>
          </section>
        )}

        {item.source_id && item.source_table && (
          <Link href={`/places?idea=${item.source_table}:${item.source_id}`} className="inline-flex min-h-11 items-center gap-2 font-bold text-teal">
            <ArrowUpRight className="size-[18px]" strokeWidth={2.4} aria-hidden />
            Open on the board
          </Link>
        )}

        {canEdit && (
          <section aria-label="Actions" className="space-y-2">
            <Button variant="outline" className="w-full" onClick={onEdit}>
              <Pencil className="size-[18px]" aria-hidden />
              Edit details
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {!item.tentative && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onDone(!item.done);
                    onClose();
                  }}
                >
                  <CircleCheck className="size-[18px]" aria-hidden />
                  {item.done ? "Mark incomplete" : "Mark complete"}
                </Button>
              )}
              <Button
                variant="danger"
                className={item.tentative ? "col-span-2" : undefined}
                onClick={() => {
                  onRemove();
                  onClose();
                }}
              >
                <Trash2 className="size-[18px]" aria-hidden />
                Remove
              </Button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}
