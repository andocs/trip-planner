"use client";

import { BedDouble, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { IdeaModal } from "@/components/ideas/idea-modal";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { Idea } from "@/lib/drafts";
import type { IdeaPayload } from "@/lib/idea-form";
import { useIdeas } from "@/lib/queries/ideas";
import { useRemoveStay } from "@/lib/queries/stays";
import { useInsertRow, useRows, useUpdateRow } from "@/lib/queries/table";
import { blankStayForm, formFromIdeaAsStay, formFromStay, stayIdeaColumns } from "@/lib/stay-sync";
import type { StayStep } from "./add-stay-menu";
import { formatMoney } from "@/lib/format";

/** Everything the Stays page opens on top of itself: the idea picker, the stay form, or the add-a-plan form. */
export function StayFlow({ flow, onFlow, onClose }: { flow: StayStep; onFlow: (s: StayStep | null) => void; onClose: () => void }) {
  const trip = useTrip();
  const { ideas } = useIdeas();
  const destinations = useRows("destinations");
  const insertIdea = useInsertRow("hotel_ideas", "stay");
  const updateIdea = useUpdateRow("hotel_ideas", "stay");
  const removeStay = useRemoveStay();
  const cities = [...new Set([...(destinations.data ?? []).map((d) => d.city), ...ideas.map((i) => i.city)].filter(Boolean) as string[])].sort();
  const hotelIdeas = ideas.filter((i) => i.kind === "stay");

  if (flow.step === "pick")
    return (
      <IdeaPicker
        ideas={hotelIdeas.filter((i) => i.decision !== "dropped" && !i.stay)}
        currency={trip.home_currency}
        onPick={(idea) => onFlow({ step: "form", fromIdea: idea })}
        onNew={() => onFlow({ step: "form" })}
        onClose={onClose}
      />
    );

  if (flow.step === "idea") return <IdeaModal kind="stay" cities={cities} onClose={onClose} />;

  const { stay, fromIdea } = flow;
  // A stay IS its hotel idea (same id), so editing a stay and booking an idea are the same write.
  const idea = stay ? hotelIdeas.find((i) => i.id === stay.id) : fromIdea;
  const defaults = idea?.stay
    ? formFromStay(idea, trip.home_currency)
    : idea
      ? formFromIdeaAsStay(idea, trip.start_date, trip.home_currency)
      : blankStayForm(trip.home_currency);

  const save = (payload: IdeaPayload, out: Record<string, unknown>, draftId: string) => {
    const columns = stayIdeaColumns(out as never, payload);
    if (idea) updateIdea.mutate({ id: idea.id, patch: columns as never });
    else insertIdea.mutate([{ id: draftId, ...payload.insertOnly, ...columns } as never]);
  };

  return (
    <IdeaModal
      key={stay?.id ?? fromIdea?.id ?? "new"}
      kind="stay"
      idea={idea}
      cities={cities}
      onClose={onClose}
      stay={{
        defaults,
        editing: !!stay,
        save,
        onDelete: stay ? () => removeStay(stay) : undefined,
      }}
    />
  );
}

/** Pick the hotel idea this booking is for. Nothing to pick, or something else: enter a new stay. */
function IdeaPicker({
  ideas,
  currency,
  onPick,
  onNew,
  onClose,
}: {
  ideas: Idea[];
  currency: string;
  onPick: (i: Idea) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => ideas.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())), [ideas, q]);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a confirmed stay"
      description="Pick the place from your ideas, or enter a new one."
      footer={
        <Button variant="outline" size="sm" onClick={onNew}>
          <Plus className="size-4" aria-hidden />
          Enter a new stay
        </Button>
      }
    >
      <div className="space-y-3 pt-1">
        {ideas.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input aria-label="Search your stay ideas" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your stay ideas" autoComplete="off" className="pl-10" />
          </div>
        )}
        {ideas.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-5 text-sm text-fg-muted">
            No stay ideas waiting. Add hotels on Places first, or enter this one by hand.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-1 py-2 text-sm text-fg-muted">Nothing matches.</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3.5 text-left transition-colors hover:bg-line"
                >
                  <BedDouble className="size-5 shrink-0 text-teal" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{i.name}</b>
                    <small className="text-[13px] text-fg-muted">
                      {[i.city, i.total ?? i.price !== null ? formatMoney(i.total ?? i.price ?? 0, currency) : null, i.decision === "draft" ? "Draft" : "Confirmed"].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
