"use client";

import { Camera, ImagePlus, Star, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { creditText, MAX_PER_IDEA, sourceLabel } from "@/lib/photos/shared";
import type { PhotoOwner } from "@/lib/drafts";
import { useMakeCover, useRemovePhoto, type ImageRow } from "@/lib/queries/images";
import { cn } from "@/lib/utils";
import { PhotoImg } from "./photo-img";

const AddPhotoSheet = dynamic(() => import("./add-photo-sheet").then((m) => m.AddPhotoSheet), { ssr: false });

const rowName = (r: ImageRow, i: number) =>
  r.source === "upload" ? `Photo ${i + 1}` : r.source === "wikimedia" ? "Wikimedia photo" : `Photo ${i + 1}`;
const rowSource = (r: ImageRow) =>
  r.source === "upload"
    ? "Uploaded"
    : r.source === "link"
      ? `Link${r.credit ? ` from ${r.credit}` : ""}`
      : sourceLabel(r);

/**
 * An idea's photos in its sheet. Everyone sees the big photo with its credit (and thumbnails to switch). The owner also
 * manages them: make a photo the cover, remove one, add more (by link or upload). Viewers have no controls at all.
 */
export function IdeaPhotos({
  idea,
  images,
  urlOf,
  canEdit,
}: {
  idea: PhotoOwner;
  images: ImageRow[];
  urlOf: (row: ImageRow) => string | null;
  canEdit: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const cover = useMakeCover();
  const remove = useRemovePhoto();
  const shown = images[Math.min(index, images.length - 1)];
  const credit = shown ? creditText(shown) : null;

  return (
    <section aria-label="Photos" className="space-y-3">
      {shown ? (
        <>
          <div className="relative aspect-[2/1] overflow-hidden rounded-[18px] bg-surface-2">
            <PhotoImg src={urlOf(shown)} alt={`Photo of ${idea.name}`} className="absolute inset-0 size-full" />
            {images.length > 1 && (
              <span className="absolute top-2.5 right-2.5 inline-flex min-h-7 items-center rounded-full bg-surface px-2.5 text-[13px] font-bold text-fg shadow-float">
                {Math.min(index, images.length - 1) + 1} of {images.length}
              </span>
            )}
          </div>
          <p className="-mt-1 flex items-start gap-2 text-[13px] text-fg-muted">
            <Camera className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
            <span>
              {credit ?? (canEdit ? "Your photo" : "Uploaded by the owner")}
              {shown.source === "wikimedia" && shown.page_url && (
                <>
                  <br />
                  <a
                    href={shown.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center font-bold text-teal"
                  >
                    View on Wikimedia Commons
                  </a>
                  {shown.license_url && (
                    <>
                      {" · "}
                      <a
                        href={shown.license_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-bold text-teal"
                      >
                        {shown.license ?? "Licence"}
                      </a>
                    </>
                  )}
                </>
              )}
              {shown.source === "link" && shown.page_url && (
                <>
                  <br />
                  <a
                    href={shown.page_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex min-h-11 items-center font-bold text-teal"
                  >
                    Open the original page
                  </a>
                </>
              )}
            </span>
          </p>
        </>
      ) : (
        !canEdit && null
      )}

      {canEdit ? (
        <div className="space-y-2">
          {images.length > 0 && (
            <>
              <h3 className="flex items-baseline justify-between font-display text-[17px] font-extrabold tracking-tight">
                Photos
                <span className="font-sans text-sm font-medium text-fg-muted">{images.length}</span>
              </h3>
              <ul className="overflow-hidden rounded-2xl bg-surface-2">
                {images.map((r, i) => (
                  <li
                    key={r.id}
                    className={cn("flex min-h-16 items-center gap-3 p-2", i > 0 && "border-t border-line")}
                  >
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Show ${rowName(r, i)}`}
                      className={cn(
                        "h-12 w-16 shrink-0 overflow-hidden rounded-[10px] bg-surface",
                        i === index && "ring-[2.5px] ring-teal",
                      )}
                    >
                      <PhotoImg
                        src={urlOf(r)}
                        alt=""
                        className="size-full"
                        fallback={<span className="block size-full bg-surface-2" />}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        {rowName(r, i)}
                        {i === 0 && (
                          <span className="inline-flex min-h-[22px] items-center gap-1 rounded-full bg-teal-tint px-2 text-xs font-bold text-teal">
                            <Star className="size-3" strokeWidth={2.6} aria-hidden />
                            Cover
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-fg-muted">{rowSource(r)}</p>
                    </div>
                    <div className="flex shrink-0">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => cover.mutate({ rows: images, id: r.id })}
                          disabled={cover.isPending}
                          aria-label={`Make ${rowName(r, i)} the cover`}
                          className="grid size-11 place-items-center rounded-xl text-fg"
                        >
                          <Star className="size-5" strokeWidth={2.2} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove.mutate(r)}
                        disabled={remove.isPending}
                        aria-label={`Remove ${rowName(r, i)}`}
                        className="grid size-11 place-items-center rounded-xl text-danger"
                      >
                        <Trash2 className="size-5" strokeWidth={2.2} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {images.length < MAX_PER_IDEA ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold ring-2 ring-line-strong"
            >
              <ImagePlus className="size-5" strokeWidth={2.4} aria-hidden />
              Add a photo
            </button>
          ) : (
            <p className="text-center text-sm text-fg-muted">
              This idea has the most photos it can hold ({MAX_PER_IDEA}).
            </p>
          )}
        </div>
      ) : (
        images.length > 1 && (
          <div
            role="group"
            aria-label="All photos"
            className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5"
          >
            {images.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-[54px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface-2",
                  i === index && "ring-[2.5px] ring-teal",
                )}
              >
                <PhotoImg
                  src={urlOf(r)}
                  alt=""
                  className="size-full"
                  fallback={<span className="block size-full bg-surface-2" />}
                />
              </button>
            ))}
          </div>
        )
      )}
      {adding && (
        // The photo sheet is portalled, but React still bubbles its events to this component's parents. Without this, a submit
        // inside it ("Find photo") would also submit the activity form this section sits in, and close it.
        <div onSubmit={(e) => e.stopPropagation()}>
          <AddPhotoSheet idea={idea} onClose={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}
