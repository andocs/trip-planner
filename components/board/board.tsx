"use client";

import { ArrowUpDown, ClipboardPaste, Info, Lightbulb, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/queries/table";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { itineraryUsage, usageLabel } from "@/lib/itinerary";
import { confirmGate, needsConfirmation } from "@/lib/confirm-gate";
import { ConfirmIdeaSheet } from "./confirm-idea-sheet";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  compareByVotes,
  ideaKey,
  isIdeaTable,
  tally,
  type Decision,
  type Idea,
  type IdeaKind,
  type VoteValue,
} from "@/lib/drafts";
import { useCastVote, useConfirmIdea, useDeleteIdea, useIdeas, useMyName, usePeople, useSetDecision, useSocial, type Vote } from "@/lib/queries/ideas";
import { useImages, usePhotoUrls } from "@/lib/queries/images";
import { usePlaceRefs } from "@/lib/queries/places";
import { useUser } from "@/lib/queries/trip";
import { setSearchParam } from "@/lib/tab-param";
import { cn } from "@/lib/utils";
import { OtherMenus } from "@/components/places/menu-panel";
import { openAddIdea } from "./capture-host";
import { IdeaModal } from "@/components/ideas/idea-modal";
import { IdeaCard } from "./idea-card";

const IdeaSheet = dynamic(() => import("./idea-sheet").then((m) => m.IdeaSheet), { ssr: false });
const NameSheet = dynamic(() => import("./name-sheet").then((m) => m.NameSheet), { ssr: false });
const TentativeSheet = dynamic(() => import("./tentative-sheet").then((m) => m.TentativeSheet), { ssr: false });

type Kind = IdeaKind | "all";
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stay", label: "Stays" },
  { value: "food", label: "Food" },
  { value: "sight", label: "Sights" },
];

/**
 * The scratchpad: every hotel, food spot and sight as a card, with votes and comments.
 * Owners triage (confirm, drop, add a tentative stop); viewers vote and comment. Nothing here counts
 * toward the budget until it is confirmed.
 */
export function Board() {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const user = useUser();
  const params = useSearchParams();
  const { ideas, isPending } = useIdeas();
  const { votesBy, commentsBy } = useSocial();
  const people = usePeople();
  const placeRefs = usePlaceRefs();
  const photos = useImages();
  const urlOf = usePhotoUrls();
  const myName = useMyName();
  const cast = useCastVote();
  const setDecision = useSetDecision();
  const [decision, setDecisionTab] = useState<Decision>("draft");
  // The category filter lives in the address (?cat=stay|food|sight), so Places links and old tab links can open it.
  const rawCat = params.get("cat");
  const kind: Kind = rawCat === "stay" || rawCat === "food" || rawCat === "sight" ? rawCat : "all";
  const setKind = (k: Kind) => setSearchParam("cat", k === "all" ? null : k);
  const [sort, setSort] = useState<"votes" | "new">("votes");
  const [naming, setNaming] = useState<{ idea: Idea; value: VoteValue } | null>(null);
  const [stopFor, setStopFor] = useState<Idea | null>(null);
  // A place that already has a stop on the itinerary asks before it is added again.
  const [readd, setReadd] = useState<Idea | null>(null);
  // Confirming asks first when something is missing, and always for a stay (it is added to Stays too).
  const [confirming, setConfirming] = useState<Idea | null>(null);
  const [deleting, setDeleting] = useState<Idea | null>(null);
  const confirmIdea = useConfirmIdea();
  const deleteIdea = useDeleteIdea();
  const gateOf = (idea: Idea) => confirmGate(idea, { tripStart: trip.start_date, votes: tally(votesBy.get(idea.key) ?? []) });
  const askConfirm = (idea: Idea) => (needsConfirmation(idea, gateOf(idea)) ? setConfirming(idea) : confirmIdea(idea));
  const itineraryRows = useRows("itinerary_items");
  const usage = itineraryUsage(itineraryRows.data ?? [], trip.start_date);
  const askAddStop = (idea: Idea) => (usage.get(idea.key)?.length ? setReadd(idea) : setStopFor(idea));
  const [editing, setEditing] = useState<Idea | null>(null);
  const [adding, setAdding] = useState<IdeaKind | null>(null);
  const cities = [...new Set(ideas.map((i) => i.city).filter(Boolean) as string[])].sort();

  const me = user.data?.id;
  const myVote = (idea: Idea): Vote | undefined => (votesBy.get(idea.key) ?? []).find((v) => v.user_id === me);
  const vote = (idea: Idea, value: VoteValue | null) => {
    // First vote: ask for a name once (viewers may be anonymous). The vote is saved right after.
    if (value !== null && myName.isSuccess && !myName.data) return setNaming({ idea, value });
    cast.mutate({ idea, value, existing: myVote(idea) });
  };

  const openRaw = params.get("idea");
  const [openTable, openId] = openRaw?.split(":") ?? [];
  const opened = isIdeaTable(openTable) ? ideas.find((i) => i.key === ideaKey(openTable, openId ?? "")) : undefined;

  const counts: Record<Decision, number> = { draft: 0, confirmed: 0, dropped: 0 };
  for (const i of ideas) counts[i.decision]++;
  const ofKind = (k: Kind) => ideas.filter((i) => i.decision === decision && (k === "all" || i.kind === k)).length;

  const shown = ideas
    .filter((i) => i.decision === decision && (kind === "all" || i.kind === kind))
    .map((i) => ({ idea: i, tally: tally(votesBy.get(i.key) ?? []), created_at: i.created_at }))
    .sort((a, b) => (sort === "votes" ? compareByVotes(a, b) : b.created_at.localeCompare(a.created_at)))
    .map((x) => x.idea);

  if (isPending) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <Segmented<Decision>
          label="Show"
          value={decision}
          onChange={setDecisionTab}
          className="flex w-full lg:w-auto lg:min-w-[26rem]"
          options={[
            { value: "draft", label: `Draft ${counts.draft}` },
            { value: "confirmed", label: `Confirmed ${counts.confirmed}` },
            { value: "dropped", label: `Dropped ${counts.dropped}` },
          ]}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:flex-1 lg:flex-nowrap">
          <div
            role="group"
            aria-label="Type"
            className="flex basis-full [scrollbar-width:none] gap-2 overflow-x-auto py-0.5 lg:flex-1 lg:basis-0"
          >
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-bold",
                  kind === k.value ? "bg-ink text-ground" : "bg-surface text-fg ring-[1.5px] ring-line-strong",
                )}
              >
                {k.label}
                <span className="font-mono text-xs opacity-80">{ofKind(k.value)}</span>
              </button>
            ))}
          </div>
          <EditOnly>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setAdding(kind === "all" ? "stay" : kind)}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </EditOnly>
          <label className="relative ml-auto shrink-0">
            <span className="sr-only">Sort</span>
            <ArrowUpDown
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
              aria-hidden
            />
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as "votes" | "new")}
              className="min-h-11 w-auto rounded-full border-0 bg-transparent py-0 pr-6 pl-9 text-sm font-bold"
            >
              <option value="votes">Most votes</option>
              <option value="new">Newest</option>
            </Select>
          </label>
        </div>
      </div>

      <p className="flex items-center gap-2 text-[13px] text-fg-muted">
        <Info className="size-4 shrink-0" strokeWidth={2.4} aria-hidden />
        Drafts are ideas. They don&rsquo;t count toward the budget, totals or exports until{" "}
        {canEdit ? "you confirm" : "the owner confirms"} them.
      </p>

      {ideas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-5 py-9 text-center">
          <Lightbulb className="size-10 text-fg-muted" strokeWidth={1.8} aria-hidden />
          <h2 className="font-display text-xl font-extrabold">
            {canEdit ? "Throw ideas at the board" : "No ideas on the board yet"}
          </h2>
          <p className="max-w-[40ch] text-fg-muted">
            {canEdit
              ? "Hotels, food spots, sights, things friends told you. Add one, or paste a whole list and get a draft per line. Nothing counts until you confirm it."
              : "When the owner adds hotels, food spots and sights you can vote and comment here."}
          </p>
          <EditOnly>
            <Button onClick={() => openAddIdea({ paste: true })}>
              <ClipboardPaste className="size-[18px]" aria-hidden />
              Paste several ideas
            </Button>
          </EditOnly>
        </Card>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">
          Nothing {decision === "draft" ? "waiting for a decision" : decision} here
          {kind !== "all" ? " for this type" : ""}.
        </p>
      ) : (
        <div className="grid gap-3.5 pb-20 lg:grid-cols-3 lg:gap-[18px]">
          {shown.map((idea) => (
            <IdeaCard
              key={idea.key}
              idea={idea}
              currency={trip.home_currency}
              votes={votesBy.get(idea.key) ?? []}
              comments={commentsBy.get(idea.key) ?? []}
              myVote={(myVote(idea)?.value as VoteValue | undefined) ?? null}
              canEdit={canEdit}
              nameOf={people.name}
              place={placeRefs.byIdea.get(idea.key)}
              images={photos.byIdea.get(idea.key) ?? []}
              urlOf={urlOf}
              onOpen={() => setSearchParam("idea", idea.key)}
              onVote={(v) => vote(idea, v)}
              onConfirm={() => askConfirm(idea)}
              onDelete={() => setDeleting(idea)}
              onRestore={() => setDecision(idea, "draft")}
              onAddStop={() => askAddStop(idea)}
              inItinerary={usageLabel(usage.get(idea.key))}
            />
          ))}
        </div>
      )}

      {kind === "food" && (
        <OtherMenus restaurants={ideas.filter((i) => i.kind === "food").map((i) => i.name)} />
      )}

      <EditOnly>
        <Button
          onClick={() => openAddIdea()}
          aria-label="Add idea"
          className="fixed right-4 bottom-[calc(var(--tabbar-h)+1rem)] z-30 size-14 gap-2 p-0 shadow-float lg:right-8 lg:bottom-8 lg:h-14 lg:w-auto lg:px-6"
        >
          <Plus className="size-7" strokeWidth={2.6} aria-hidden />
          <span className="hidden lg:inline">Add idea</span>
        </Button>
      </EditOnly>

      {opened && (
        <IdeaSheet
          idea={opened}
          votes={votesBy.get(opened.key) ?? []}
          comments={commentsBy.get(opened.key) ?? []}
          myVote={(myVote(opened)?.value as VoteValue | undefined) ?? null}
          people={people}
          place={placeRefs.byIdea.get(opened.key)}
          images={photos.byIdea.get(opened.key) ?? []}
          urlOf={urlOf}
          onVote={(v) => vote(opened, v)}
          onDelete={() => setDeleting(opened)}
          onDecision={(d) => {
            if (d === "confirmed") return askConfirm(opened);
            setDecision(opened, d);
            setSearchParam("idea", null); // the idea moves to another tab, so close its sheet
          }}
          onAddStop={() => askAddStop(opened)}
          inItinerary={usageLabel(usage.get(opened.key))}
          onEdit={() => setEditing(opened)}
          onClose={() => setSearchParam("idea", null)}
        />
      )}
      {naming && (
        <NameSheet
          idea={naming.idea}
          value={naming.value}
          onDone={() => {
            cast.mutate({ idea: naming.idea, value: naming.value, existing: myVote(naming.idea) });
            setNaming(null);
          }}
          onCancel={() => setNaming(null)}
        />
      )}
      {confirming && (
        <ConfirmIdeaSheet
          idea={confirming}
          gate={gateOf(confirming)}
          onClose={() => setConfirming(null)}
          onEdit={() => {
            setEditing(confirming);
            setConfirming(null);
          }}
          onConfirm={() => {
            confirmIdea(confirming);
            if (opened && opened.key === confirming.key) setSearchParam("idea", null); // it moves to the Confirmed tab
            setConfirming(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title="Delete this place?"
          description={`“${deleting.name}” will be deleted, with its photos, votes and comments. You can undo it for a few seconds.`}
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            deleteIdea(deleting);
            if (opened && opened.key === deleting.key) setSearchParam("idea", null);
            setDeleting(null);
          }}
        />
      )}
      {readd && (
        <ConfirmSheet
          title="Already in the itinerary"
          description={`“${readd.name}” is already on the itinerary (${usageLabel(usage.get(readd.key))}). Add it again?`}
          confirmLabel="Add again"
          onClose={() => setReadd(null)}
          onConfirm={() => {
            setStopFor(readd);
            setReadd(null);
          }}
        />
      )}
      {stopFor && <TentativeSheet idea={stopFor} onClose={() => setStopFor(null)} />}
      {editing && <IdeaModal kind={editing.kind} idea={editing} cities={cities} onClose={() => setEditing(null)} />}
      {adding && <IdeaModal kind={adding} cities={cities} onClose={() => setAdding(null)} />}
    </div>
  );
}
