"use client";

import { Globe, Images, ImageOff, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { creditText, sourceLabel } from "@/lib/photos/shared";
import type { ImageRow } from "@/lib/queries/images";
import { cn } from "@/lib/utils";
import { PhotoImg } from "./photo-img";

/**
 * The card's cover: the idea's first photo, with a badge for how many there are, where it came from and, for a
 * Wikimedia picture, the credit its licence needs. `tag` is the Stay / Food / Sight chip, drawn by the caller.
 * If the picture can't be loaded the card keeps its shape and shows "Photo unavailable".
 */
export function CoverHero({
  images,
  urlOf,
  name,
  tag,
  className,
}: {
  images: ImageRow[];
  urlOf: (row: ImageRow) => string | null;
  name: string;
  tag: ReactNode;
  className?: string;
}) {
  const cover = images[0];
  const SourceIcon = cover.source === "upload" ? Upload : Globe;
  const credit = creditText(cover);
  return (
    <div className={cn("relative aspect-[21/9] overflow-hidden bg-surface-2", className)}>
      <PhotoImg
        src={urlOf(cover)}
        alt={`Photo of ${name}`}
        className="absolute inset-0 size-full"
        fallback={
          <span
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-2 text-[13px] font-bold text-fg-muted"
            role="img"
            aria-label="Photo unavailable"
          >
            <ImageOff className="size-7" strokeWidth={1.8} aria-hidden />
            Photo unavailable
          </span>
        }
      />
      {tag}
      {images.length > 1 && (
        <span className="absolute top-2.5 right-2.5 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[13px] font-bold text-fg shadow-float">
          <Images className="size-3.5" strokeWidth={2.4} aria-hidden />
          <span className="sr-only">Photos: </span>
          {images.length}
        </span>
      )}
      <span className="absolute right-2.5 bottom-2 left-2.5 flex text-[11px] font-bold">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--attrib-bg)] px-2.5 py-1 text-[var(--attrib-ink)]">
          {cover.source !== "wikimedia" && <SourceIcon className="size-3 shrink-0" strokeWidth={2.4} aria-hidden />}
          <span className="truncate">{credit ?? sourceLabel(cover)}</span>
        </span>
      </span>
    </div>
  );
}
