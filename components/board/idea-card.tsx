"use client";

import {
  BedDouble,
  CalendarPlus,
  Check,
  CircleHelp,
  Landmark,
  ExternalLink,
  MapPin,
  MessageCircle,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CoverHero } from "@/components/photos/cover-hero";
import { mapsLinkFor } from "@/lib/places/normalize";
import type { ImageRow } from "@/lib/queries/images";
import type { PlaceRef } from "@/lib/queries/places";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { KIND_LABEL, type Idea, type IdeaKind, type VoteValue } from "@/lib/drafts";
import { tally } from "@/lib/drafts";
import type { Comment, Vote } from "@/lib/queries/ideas";
import { cn } from "@/lib/utils";
import { VoteButtons } from "./vote-buttons";

export const KIND_ICON = { stay: BedDouble, food: Utensils, sight: Landmark } as const;
const KIND_TINT: Record<IdeaKind, string> = {
  stay: "from-[color-mix(in_srgb,var(--chart-3)_30%,var(--surface))] to-[color-mix(in_srgb,var(--chart-1)_24%,var(--surface))]",
  food: "from-[color-mix(in_srgb,var(--chart-4)_30%,var(--surface))] to-[color-mix(in_srgb,var(--chart-2)_20%,var(--surface))]",
  sight:
    "from-[color-mix(in_srgb,var(--chart-1)_30%,var(--surface))] to-[color-mix(in_srgb,var(--chart-6)_26%,var(--surface))]",
};

/** The idea's cover photo when it has any, else a calm tinted tile (never a broken image). */
export function Hero({
  idea,
  images,
  urlOf,
  className,
}: {
  idea: Idea;
  images: ImageRow[];
  urlOf: (row: ImageRow) => string | null;
  className?: string;
}) {
  const Icon = KIND_ICON[idea.kind];
  const tag = (
    <span className="absolute top-2.5 left-2.5 z-[1] inline-flex min-h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[13px] font-bold text-fg shadow-float">
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
      {KIND_LABEL[idea.kind]}
    </span>
  );
  if (images.length > 0)
    return <CoverHero images={images} urlOf={urlOf} name={idea.name} tag={tag} className={className} />;
  return (
    <div
      className={cn(
        "relative flex aspect-[21/9] flex-col items-center justify-center gap-1 bg-gradient-to-br text-fg-muted",
        KIND_TINT[idea.kind],
        className,
      )}
    >
      <span className="absolute top-2.5 left-2.5 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[13px] font-bold text-fg shadow-float">
        <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
        {KIND_LABEL[idea.kind]}
      </span>
      <Icon className="size-8 opacity-70" strokeWidth={1.8} aria-hidden />
      <span className="text-[13px] font-bold">No photo yet</span>
    </div>
  );
}

export function PriceTag({ idea, currency }: { idea: Idea; currency: string }) {
  if (idea.price === null) return <span className="shrink-0 text-[13px] text-fg-muted">Price not set</span>;
  return (
    <span className="shrink-0 text-right font-mono text-sm font-bold tabular-nums">
      {formatMoney(idea.price, currency)}
      <small className="block text-[11px] font-medium text-fg-muted">
        {idea.priceUnit === "night" ? "per night" : idea.priceUnit === "person" ? "per person" : "total"}
      </small>
    </span>
  );
}

export function Tally({
  votes,
  commentCount,
  nameOf,
}: {
  votes: Vote[];
  commentCount: number;
  nameOf: (userId: string) => string;
}) {
  const t = tally(votes);
  const ins = votes.filter((v) => v.value === "in");
  if (t.total === 0 && commentCount === 0) return <p className="min-h-8 text-[13px] text-fg-muted">No votes yet</p>;
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1">
      {ins.length > 0 && (
        <span className="flex" aria-hidden>
          {ins.slice(0, 4).map((v, i) => (
            <Avatar
              key={v.id}
              name={nameOf(v.user_id)}
              className={cn("size-7 text-[10px] ring-2 ring-surface", i > 0 && "-ml-1.5")}
            />
          ))}
        </span>
      )}
      <span className="inline-flex gap-3 text-[13px] font-bold">
        <span className="inline-flex items-center gap-1 text-teal">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
          <span className="sr-only">In: </span>
          {t.in}
        </span>
        <span className="inline-flex items-center gap-1 text-warn-text">
          <CircleHelp className="size-3.5" strokeWidth={2.6} aria-hidden />
          <span className="sr-only">Maybe: </span>
          {t.maybe}
        </span>
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <X className="size-3.5" strokeWidth={3} aria-hidden />
          <span className="sr-only">Pass: </span>
          {t.pass}
        </span>
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-fg-muted">
        <MessageCircle className="size-4" strokeWidth={2.4} aria-hidden />
        <span className="sr-only">Comments: </span>
        {commentCount}
      </span>
    </div>
  );
}

export function IdeaCard({
  idea,
  currency,
  votes,
  comments,
  myVote,
  canEdit,
  nameOf,
  place,
  images,
  urlOf,
  onOpen,
  onVote,
  onConfirm,
  onRestore,
  onAddStop,
}: {
  idea: Idea;
  currency: string;
  votes: Vote[];
  comments: Comment[];
  myVote: VoteValue | null;
  canEdit: boolean;
  nameOf: (userId: string) => string;
  place?: PlaceRef;
  images: ImageRow[];
  urlOf: (row: ImageRow) => string | null;
  onOpen: () => void;
  onVote: (v: VoteValue | null) => void;
  onConfirm: () => void;
  onRestore: () => void;
  onAddStop: () => void;
}) {
  const dropped = idea.decision === "dropped";
  return (
    <article
      aria-label={idea.name}
      className="flex h-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-card"
    >
      <button type="button" onClick={onOpen} className="block text-left" aria-label={`Open ${idea.name}`}>
        <Hero idea={idea} images={images} urlOf={urlOf} className={cn(dropped && "opacity-80")} />
      </button>
      <div className="flex flex-1 flex-col gap-2.5 p-4 pt-3.5">
        <button
          type="button"
          onClick={onOpen}
          className={cn("flex flex-col gap-2.5 text-left", dropped && "opacity-80")}
        >
          <span className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[19px] leading-[1.1] font-extrabold tracking-tight text-balance">
              {idea.name}
            </h3>
            <PriceTag idea={idea} currency={currency} />
          </span>
          <span className="-mt-1 flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
            {idea.city && (
              <>
                <MapPin className="size-[15px]" strokeWidth={2.4} aria-hidden />
                {idea.city}
              </>
            )}
            {idea.decision === "confirmed" && (
              <span className="inline-flex min-h-6 items-center rounded-full bg-teal-tint px-2.5 text-xs font-bold text-teal">
                Confirmed
              </span>
            )}
            {dropped && (
              <span className="inline-flex min-h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-bold text-fg">
                Dropped
              </span>
            )}
          </span>
          <Tally votes={votes} commentCount={comments.length} nameOf={nameOf} />
        </button>
        {place && (
          <a
            href={mapsLinkFor(place.place_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-teal"
          >
            <ExternalLink className="size-4" strokeWidth={2.4} aria-hidden />
            Open in Google Maps
          </a>
        )}
        <div className="mt-auto">
          {dropped ? (
            canEdit && (
              <Button variant="outline" size="sm" className="w-full" onClick={onRestore}>
                <Undo2 className="size-[18px]" aria-hidden />
                Restore to drafts
              </Button>
            )
          ) : canEdit && idea.decision === "draft" ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="min-w-0 flex-1" onClick={onAddStop}>
                <CalendarPlus className="size-[18px]" aria-hidden />
                Add to itinerary
              </Button>
              <Button variant="secondary" size="sm" className="min-w-0 flex-1" onClick={onConfirm}>
                <Check className="size-[18px]" strokeWidth={2.8} aria-hidden />
                Confirm
              </Button>
            </div>
          ) : !canEdit && idea.decision !== "confirmed" ? (
            <VoteButtons value={myVote} onVote={onVote} label={`Your vote on ${idea.name}`} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
