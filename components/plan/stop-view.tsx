"use client";

import { ArrowUpRight, CircleCheck, Clock, EllipsisVertical, ListTree, MapPin, NotebookText, Pencil, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { CHIP_ICONS, MustFlag } from "@/components/ideas/idea-chips";
import { IdeaPhotos } from "@/components/photos/idea-photos";
import { Button } from "@/components/ui/button";
import { FormGroup } from "@/components/ui/form-group";
import { PlaceLinks } from "@/components/ui/place-links";
import { Sheet } from "@/components/ui/sheet";
import type { Idea } from "@/lib/drafts";
import { formatDay, formatDuration, timeRange } from "@/lib/format";
import { detailRows, parseDetails } from "@/lib/idea-details";
import { dayOf, stopLinks } from "@/lib/itinerary";
import { stopRows } from "@/lib/itinerary-rows";
import type { ImageRow } from "@/lib/queries/images";
import type { Row } from "@/lib/queries/table";
import { cn } from "@/lib/utils";

/**
 * A stop, read-only, laid out like the place view: status and the main actions on top, When first (it is what a stop is),
 * then photos, details and links, then notes. What a click on a card opens, for everyone. Editors get Mark complete and Edit,
 * and a menu for Remove and Open on the board.
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
  // The note has its own section below, so it is not repeated as a detail row; the time is in "When".
  const rows = stopRows(item, idea, currency).filter((r) => r.label !== "Time" && !(note && r.label === "Note"));
  // The category's own details (type, hours, tickets ...), whether they came from the board or were typed on the activity.
  const more = idea ? detailRows(idea) : [];
  const day = dayOf(item, startDate);
  const range = timeRange(item.at_time, item.duration_min);
  const status = item.done ? "Done" : item.tentative ? "Tentative" : "Planned";
  const menuRow = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none data-[highlighted]:bg-surface-2";
  const board = item.source_id && item.source_table ? `/places?idea=${item.source_table}:${item.source_id}` : null;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.activity}
      description={[item.type, item.city].filter(Boolean).join(" · ") || undefined}
      className="md:top-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[27.5rem] md:translate-x-0 md:translate-y-0 md:rounded-l-3xl md:rounded-r-none"
      headerExtra={
        canEdit || board ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label="More actions" className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
              <EllipsisVertical className="size-5" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-[60] min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
                {board && (
                  <DropdownMenu.Item asChild className={menuRow}>
                    <Link href={board}>
                      <ArrowUpRight className="size-4 text-fg-muted" aria-hidden />
                      Open on the board
                    </Link>
                  </DropdownMenu.Item>
                )}
                {canEdit && (
                  <DropdownMenu.Item
                    onSelect={() => {
                      onRemove();
                      onClose();
                    }}
                    className={cn(menuRow, "text-danger")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remove
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : undefined
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-extrabold",
              item.tentative ? "bg-warn-tint text-warn-text" : "bg-teal-tint text-teal",
            )}
          >
            {status}
          </span>
          {idea?.dealBreaker && <MustFlag />}
          {canEdit && (
            <>
              {!item.tentative && (
                <Button
                  size="sm"
                  onClick={() => {
                    onDone(!item.done);
                    onClose();
                  }}
                >
                  <CircleCheck className="size-[18px]" aria-hidden />
                  {item.done ? "Mark incomplete" : "Mark complete"}
                </Button>
              )}
              <Button size="sm" variant="outline" aria-label="Edit details" onClick={onEdit}>
                <Pencil className="size-[18px]" aria-hidden />
                Edit
              </Button>
            </>
          )}
        </div>

        <FormGroup icon={Clock} title="When">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-teal-tint px-3.5 py-3 text-teal">
              <small className="block text-xs font-bold">{day === null ? "Day" : `Day ${day}`}</small>
              <b className="block text-[17px] leading-tight">{day === null ? "Not set yet" : item.on_date ? formatDay(item.on_date) : "–"}</b>
            </div>
            <div className="rounded-2xl bg-teal-tint px-3.5 py-3 text-teal">
              <small className="block text-xs font-bold">Time</small>
              <b className="block text-[17px] leading-tight">{range || "Any time"}</b>
              {!item.at_time && item.duration_min ? <small className="block text-xs font-medium">{formatDuration(item.duration_min)}</small> : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup icon={ListTree} title="Details">
          {images.length > 0 && (
            <IdeaPhotos idea={{ table: "itinerary_items", id: item.id, key: `itinerary_items:${item.id}`, name: item.activity }} images={images} urlOf={urlOf} canEdit={false} />
          )}
          {item.city && (
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <MapPin className="size-[15px]" strokeWidth={2.4} aria-hidden />
              {item.city}
            </p>
          )}
          {rows.length > 0 && (
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
          )}
          {more.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
              {more.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-fg-muted">{r.label}</dt>
                  <dd className="font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <PlaceLinks website={website} mapsUrl={mapsUrl} className="flex flex-wrap gap-x-5" />
        </FormGroup>

        {note && (
          <FormGroup icon={NotebookText} title="Notes">
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] whitespace-pre-line">{note}</p>
          </FormGroup>
        )}
      </div>
    </Sheet>
  );
}
