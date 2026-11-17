"use client";

import {
  CalendarPlus,
  Check,
  CircleHelp,
  CircleOff,
  EllipsisVertical,
  ExternalLink,
  ListTree,
  MessageCircle,
  Pencil,
  SendHorizontal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { FormGroup } from "@/components/ui/form-group";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useCanEdit, useRole, useTrip } from "@/components/trip-gate";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { KIND_LABEL, tally, type Decision, type Idea, type VoteValue } from "@/lib/drafts";
import { useAddComment, type Comment, type usePeople, type Vote } from "@/lib/queries/ideas";
import { useUser } from "@/lib/queries/trip";
import { useDeleteRow } from "@/lib/queries/table";
import { formatDay } from "@/lib/format";
import { mapsLinkFor } from "@/lib/places/normalize";
import { PlaceLinks } from "@/components/ui/place-links";
import { parseDetails } from "@/lib/idea-details";
import { IdeaPhotos } from "@/components/photos/idea-photos";
import { DetailsList, MustFlag } from "@/components/ideas/idea-chips";
import { MenuSection } from "@/components/places/menu-panel";
import type { ImageRow } from "@/lib/queries/images";
import type { PlaceRef } from "@/lib/queries/places";
import { Hero, PriceTag } from "./idea-card";
import { VoteButtons } from "./vote-buttons";

const VOTE_ICON = { in: Check, maybe: CircleHelp, pass: X } as const;
const VOTE_COLOR = { in: "text-teal", maybe: "text-warn-text", pass: "text-fg-muted" } as const;

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return formatDay(iso.slice(0, 10));
};

/** One idea in full: votes with names, the comment thread, and (for the owner) Confirm / Drop. */
export function IdeaSheet({
  idea,
  votes,
  comments,
  myVote,
  people,
  place,
  images,
  urlOf,
  onVote,
  onDecision,
  onAddStop,
  inItinerary,
  onDelete,
  onEdit,
  onClose,
}: {
  idea: Idea;
  votes: Vote[];
  comments: Comment[];
  myVote: VoteValue | null;
  people: ReturnType<typeof usePeople>;
  place?: PlaceRef;
  images: ImageRow[];
  urlOf: (row: ImageRow) => string | null;
  onVote: (v: VoteValue | null) => void;
  onDecision: (d: Decision) => void;
  onAddStop: () => void;
  /** "Day 2" when this place already has a stop on the itinerary (then Add asks first), else empty. */
  inItinerary?: string;
  /** Dropped ideas: delete for good (the board asks first). */
  onDelete?: () => void;
  /** Owner or editor: open this idea's own details (name, city, price, notes, status) for editing. */
  onEdit: () => void;
  onClose: () => void;
}) {
  const trip = useTrip();
  const links = parseDetails(idea.kind, idea.details);
  const canEdit = useCanEdit();
  const isOwner = useRole() === "owner" && canEdit;
  const me = useUser().data?.id;
  const addComment = useAddComment();
  const removeComment = useDeleteRow("comments", "comment");
  const [text, setText] = useState("");
  const t = tally(votes);
  const voters = [...votes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const decided = idea.decision !== "draft";

  const post = () => {
    if (addComment(idea, text)) setText("");
  };

  const statusLabel = idea.decision === "draft" ? "Draft" : idea.decision === "confirmed" ? "Confirmed" : "Dropped";
  const menuRow = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none data-[highlighted]:bg-surface-2";

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={idea.name}
      description={[KIND_LABEL[idea.kind], idea.city, idea.dealBreaker ? "Must-do" : null].filter(Boolean).join(" · ")}
      badge={
        <span
          className={cn(
            "inline-flex min-h-6 items-center rounded-full px-2 text-xs font-extrabold",
            idea.decision === "confirmed" ? "bg-teal-tint text-teal" : idea.decision === "dropped" ? "bg-danger-tint text-danger" : "bg-warn-tint text-warn-text",
          )}
        >
          {statusLabel}
        </span>
      }
      className="md:top-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[27.5rem] md:translate-x-0 md:translate-y-0 md:rounded-l-3xl md:rounded-r-none"
      headerExtra={
        canEdit ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label="More actions" className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
              <EllipsisVertical className="size-5" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-[60] min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
                <DropdownMenu.Item onSelect={onEdit} className={menuRow}>
                  <Pencil className="size-4 text-fg-muted" aria-hidden />
                  Edit details
                </DropdownMenu.Item>
                {idea.decision === "confirmed" && (
                  <DropdownMenu.Item onSelect={() => onDecision("draft")} className={menuRow}>
                    <Undo2 className="size-4 text-fg-muted" aria-hidden />
                    Back to drafts
                  </DropdownMenu.Item>
                )}
                {idea.decision === "draft" && (
                  <DropdownMenu.Item onSelect={() => onDecision("dropped")} className={cn(menuRow, "text-danger")}>
                    <CircleOff className="size-4" aria-hidden />
                    Drop
                  </DropdownMenu.Item>
                )}
                {idea.decision === "dropped" && onDelete && (
                  <DropdownMenu.Item onSelect={onDelete} className={cn(menuRow, "text-danger")}>
                    <Trash2 className="size-4" aria-hidden />
                    Delete for good
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : undefined
      }
      footer={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <label className="sr-only" htmlFor="idea-comment">
            Add a comment
          </label>
          <input
            id="idea-comment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            autoComplete="off"
            placeholder="Add a comment"
            className="min-h-12 min-w-0 flex-1 rounded-full border-2 border-line-strong bg-surface px-4 text-base focus:border-teal focus:outline-2 focus:outline-ring"
          />
          <Button type="submit" size="icon" className="size-12" aria-label="Post comment" disabled={!text.trim()}>
            <SendHorizontal className="size-5" strokeWidth={2.4} aria-hidden />
          </Button>
        </form>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex flex-wrap items-center justify-start gap-2 empty:hidden">
          {canEdit && (
            <>
              {idea.decision === "draft" && (
                <Button size="xs" aria-label={`Confirm this ${KIND_LABEL[idea.kind].toLowerCase()}`} onClick={() => onDecision("confirmed")}>
                  <Check className="size-4" strokeWidth={2.8} aria-hidden />
                  Confirm
                </Button>
              )}
              {idea.decision === "dropped" ? (
                <Button size="xs" variant="outline" onClick={() => onDecision("draft")}>
                  Restore to drafts
                </Button>
              ) : inItinerary ? (
                <Button size="xs" variant="secondary" aria-label={`Already in the itinerary (${inItinerary}). Add again`} title={`Already in the itinerary: ${inItinerary}`} className="text-teal" onClick={onAddStop}>
                  <Check className="size-4" strokeWidth={2.8} aria-hidden />
                  In itinerary · {inItinerary}
                </Button>
              ) : (
                <Button size="xs" variant="outline" onClick={onAddStop}>
                  <CalendarPlus className="size-4" aria-hidden />
                  Add to itinerary
                </Button>
              )}
            </>
          )}
        </div>

        <FormGroup>
          {images.length > 0 || canEdit ? (
            <IdeaPhotos idea={idea} images={images} urlOf={urlOf} canEdit={canEdit} />
          ) : (
            <Hero idea={idea} images={images} urlOf={urlOf} className="rounded-[18px]" />
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <small className="block text-xs font-bold text-fg-muted">Price</small>
              <b className="block text-[17px] leading-tight">
                <PriceTag idea={idea} currency={trip.home_currency} />
              </b>
            </div>
            <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <small className="block text-xs font-bold text-fg-muted">Votes</small>
              <b className="block text-[17px] leading-tight">
                {t.total === 0 ? "None yet" : `${t.in} in · ${t.maybe} maybe`}
              </b>
            </div>
          </div>
        </FormGroup>

        <FormGroup icon={ListTree} title="Details">
          {idea.note && /^https?:\/\//.test(idea.note) && (
            <a href={idea.note} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 font-bold text-teal">
              <ExternalLink className="size-[15px]" strokeWidth={2.4} aria-hidden />
              Link
            </a>
          )}
          {idea.note && !/^https?:\/\//.test(idea.note) && <p className="text-[15px]">{idea.note}</p>}
          <DetailsList idea={idea} />
          <div className="flex flex-wrap gap-x-5">
            <PlaceLinks website={links.website} mapsUrl={links.mapsUrl} className="contents" />
            {place && (
              <a href={mapsLinkFor(place.place_id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-teal">
                <ExternalLink className="size-4" strokeWidth={2.4} aria-hidden />
                Open in Google Maps
              </a>
            )}
          </div>
          {idea.kind === "food" && <MenuSection restaurant={idea.name} />}
          {idea.decision === "draft" && canEdit && (
            <p className="text-[13px] text-fg-muted">Confirming keeps it in the plan and lets it count toward the budget and exports.</p>
          )}
        </FormGroup>

        <FormGroup icon={MessageCircle} title="Discussion">
          {!decided && (
            <section aria-label="Your vote" className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                Your vote
                {idea.dealBreaker && <MustFlag />}
              </h4>
              <VoteButtons value={myVote} onVote={onVote} label="Your vote" />
            </section>
          )}

          <section aria-label="Votes" className="space-y-2">
            <h4 className="flex items-baseline justify-between text-sm font-bold">
              Votes
              <span className="text-[13px] font-medium text-fg-muted">
                {t.in} in · {t.maybe} maybe · {t.pass} pass
              </span>
            </h4>
            {voters.length === 0 ? (
              <p className="text-sm text-fg-muted">No votes yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {voters.map((v) => {
                  const Icon = VOTE_ICON[v.value as VoteValue] ?? Check;
                  const name = people.name(v.user_id);
                  return (
                    <li key={v.id} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm font-bold">
                      <Avatar name={name} className="size-7 text-[11px]" />
                      {name}
                      <Icon className={`size-4 ${VOTE_COLOR[v.value as VoteValue] ?? ""}`} strokeWidth={3} aria-label={v.value} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Comments" className="space-y-3 pb-2">
            <h4 className="flex items-baseline justify-between text-sm font-bold">
              Comments
              <span className="text-[13px] font-medium text-fg-muted">{comments.length}</span>
            </h4>
            {comments.length === 0 && <p className="text-sm text-fg-muted">No comments yet. Ask a question or share a thought.</p>}
            {comments.map((c) => {
              const name = people.name(c.user_id);
              const canDelete = c.user_id === me || isOwner;
              return (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={name} className="size-9 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {name}
                      <time dateTime={c.created_at} className="text-xs font-medium text-fg-muted">
                        {when(c.created_at)}
                      </time>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={`Delete comment by ${name}`}
                          onClick={() => removeComment(c, "the comment")}
                          className="-my-2 -mr-2.5 ml-auto grid size-11 place-items-center text-fg-muted hover:text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                    <p className="max-w-[62ch] text-[15px] leading-snug break-words whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </section>
        </FormGroup>
      </div>
    </Sheet>
  );
}
