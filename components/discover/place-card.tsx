"use client";

import { Camera, Check, ChevronRight, Info, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaceCard as Card, PlaceKind } from "@/lib/places/types";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "@/components/board/idea-card";
import { MetaRow, OpenNow, RatingRow, TypeLine } from "./rating";
import { useNearViewport, usePlacePhoto, type PlacePhoto } from "./use-place-photo";

/** The photo tile. Always labelled with where it came from; never a broken image. */
export function PhotoTile({
  photo,
  kind,
  name,
  className,
}: {
  photo: PlacePhoto;
  kind: PlaceKind;
  name: string;
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  if (photo.kind === "none")
    return (
      <span
        className={cn(
          "grid place-items-center rounded-[14px] bg-surface-2 text-fg-muted",
          photo.loading && "animate-pulse motion-reduce:animate-none",
          className,
        )}
        aria-hidden
      >
        {photo.loading ? (
          <Camera className="size-7 opacity-60" strokeWidth={1.8} />
        ) : (
          <Icon className="size-7" strokeWidth={1.8} />
        )}
      </span>
    );
  return (
    <span className={cn("relative block overflow-hidden rounded-[14px] bg-surface-2", className)}>
      {/* A remote photo with fixed licence terms: shown as-is (no optimiser, no re-hosting). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`Photo of ${name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[var(--attrib-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--attrib-ink)]">
        {photo.kind === "wiki" ? "Wikimedia" : "Google"}
      </span>
    </span>
  );
}

export function creditText(photo: PlacePhoto) {
  if (photo.kind === "wiki") return `Photo: ${photo.credit} · Wikimedia Commons`;
  if (photo.kind === "google") return `Photo: ${photo.credit} · Google Maps`;
  return null;
}

export function photoNote(photo: PlacePhoto) {
  return creditText(photo) ?? (photo.kind === "none" && photo.loading ? "Looking for a photo…" : "No photo found for this place.");
}

/** One suggestion: a large photo, then the name, rating, type, description and address. */
export function PlaceCard({
  card,
  kind,
  saved,
  selected,
  onOpen,
  onSave,
  onSelectedRef,
}: {
  card: Card;
  kind: PlaceKind;
  saved: boolean;
  selected: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSelectedRef?: (el: HTMLElement | null) => void;
}) {
  const [ref, near] = useNearViewport<HTMLElement>();
  const photo = usePlacePhoto(card, { enabled: near, google: near });
  const credit = creditText(photo);
  return (
    <article
      ref={(el) => {
        ref.current = el;
        if (selected) onSelectedRef?.(el);
      }}
      aria-label={card.name}
      className={cn("grid gap-2 rounded-[20px] bg-surface p-3 shadow-card", selected && "ring-[2.5px] ring-teal")}
    >
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden className="block">
        <PhotoTile photo={photo} kind={kind} name={card.name} className="aspect-video w-full lg:aspect-[2/1]" />
      </button>
      <p className="-mt-0.5 flex items-start gap-1.5 px-1 text-xs text-fg-muted">
        {credit ? (
          <Camera className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
        ) : (
          <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
        )}
        <span>{photoNote(photo)}</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 min-w-0 flex-col gap-1 px-1 text-left"
        aria-label={`Open ${card.name}`}
      >
        <h3 className="font-display text-xl leading-[1.1] font-extrabold tracking-tight text-balance">{card.name}</h3>
        <RatingRow card={card} />
        <MetaRow card={card} />
        {card.description && <span className="line-clamp-2 text-[15px] leading-snug">{card.description}</span>}
        {card.address && (
          <span className="flex items-center gap-1.5 text-sm text-fg-muted">
            <MapPin className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
            {card.address}
          </span>
        )}
      </button>
      <div className="mt-1 flex items-center gap-2 px-1">
        {saved ? (
          <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-teal-tint px-3 text-[15px] font-bold text-teal">
            <Check className="size-[18px]" strokeWidth={2.8} aria-hidden />
            On your board
          </span>
        ) : (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1" onClick={onSave}>
            <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
            Save to board
          </Button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold text-teal"
        >
          Details
          <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      </div>
    </article>
  );
}

/** The compact card (small photo on the right) used over the map, where a tall card would hide the pins. */
export function CompactPlaceCard({
  card,
  kind,
  saved,
  selected,
  onOpen,
  onSave,
  onSelectedRef,
}: {
  card: Card;
  kind: PlaceKind;
  saved: boolean;
  selected: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSelectedRef?: (el: HTMLElement | null) => void;
}) {
  const [ref, near] = useNearViewport<HTMLElement>();
  const photo = usePlacePhoto(card, { enabled: near, google: near });
  const credit = creditText(photo);
  return (
    <article
      ref={(el) => {
        ref.current = el;
        if (selected) onSelectedRef?.(el);
      }}
      aria-label={card.name}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_104px] gap-x-3.5 gap-y-1 rounded-[20px] bg-surface p-3.5 pb-3 shadow-card",
        selected && "ring-[2.5px] ring-teal",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 min-w-0 flex-col gap-0.5 text-left"
        aria-label={`Open ${card.name}`}
      >
        <h3 className="font-display text-lg leading-[1.12] font-extrabold tracking-tight text-balance">{card.name}</h3>
        <RatingRow card={card} />
        <TypeLine card={card} />
        {card.address && <span className="text-sm text-fg-muted">{card.address}</span>}
        <OpenNow openNow={card.openNow} />
        {card.description && <span className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{card.description}</span>}
      </button>
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden className="self-start">
        <PhotoTile photo={photo} kind={kind} name={card.name} className="size-[104px]" />
      </button>
      <p className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
        {credit ? (
          <Camera className="size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
        ) : (
          <Info className="size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
        )}
        <span className="truncate">{photoNote(photo)}</span>
      </p>
      <div className="col-span-2 mt-1 flex items-center gap-2">
        {saved ? (
          <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-teal-tint px-3 text-[15px] font-bold text-teal">
            <Check className="size-[18px]" strokeWidth={2.8} aria-hidden />
            On your board
          </span>
        ) : (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1" onClick={onSave}>
            <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
            Save to board
          </Button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold text-teal"
        >
          Details
          <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      </div>
    </article>
  );
}
