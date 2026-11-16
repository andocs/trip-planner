"use client";

import { BedDouble, Landmark, Utensils, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { parseIdeaLines, type IdeaKind } from "@/lib/drafts";
import { useAddIdeas } from "@/lib/queries/ideas";
import { useRows } from "@/lib/queries/table";
import { useTrip } from "@/components/trip-gate";

const KIND_OPTIONS: { value: IdeaKind; label: string }[] = [
  { value: "stay", label: "Stay" },
  { value: "food", label: "Food" },
  { value: "sight", label: "Sight" },
];
const KIND_ICON = { stay: BedDouble, food: Utensils, sight: Landmark };

/**
 * Add one idea, or paste a list and get one draft per line. A price can follow a dash:
 * "Sky Hotel - 3800". Ctrl/Cmd + Enter adds from the keyboard.
 */
export function AddIdeasSheet({
  open,
  startPaste,
  onOpenChange,
}: {
  open: boolean;
  startPaste: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trip = useTrip();
  const stops = useRows("destinations");
  const add = useAddIdeas();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<IdeaKind>("stay");
  const [city, setCity] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const { items, skipped } = useMemo(() => parseIdeaLines(text), [text]);
  const kept = items.filter((i) => !removed.has(i.name.toLowerCase()));
  const many = items.length > 1;
  const cities = [...new Set((stops.data ?? []).map((s) => s.city).filter(Boolean) as string[])];

  const submit = () => {
    if (kept.length === 0 || add.isPending) return;
    add.mutate({ kind, city: city.trim() || null, items: kept }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add ideas"
      description={"One idea, or paste a list: every line becomes a draft. Drafts don’t count toward the budget."}
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" disabled={kept.length === 0 || add.isPending} onClick={submit}>
            {kept.length > 1 ? `Add ${kept.length} drafts` : "Add draft"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label={many || startPaste ? "Ideas, one per line" : "Idea"}
          hint={
            many || startPaste
              ? "Add a price after a dash: Sky Hotel - 3800"
              : "Paste a list and every line becomes its own draft."
          }
        >
          {(p) => (
            <Textarea
              {...p}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={many || startPaste ? 5 : 3}
              autoFocus
              placeholder={
                startPaste
                  ? "Old Quarter hotel - 3800\nBún chả Hương Liên\nTrain Street cafe"
                  : "Name of a hotel, food spot or sight"
              }
              className="resize-none leading-relaxed"
            />
          )}
        </Field>
        <div className="space-y-1.5">
          <span className="block text-[13px] font-bold text-fg-muted">Type</span>
          <Segmented<IdeaKind>
            label="Type"
            value={kind}
            onChange={setKind}
            className="flex w-full"
            options={KIND_OPTIONS}
          />
        </div>
        <Field label="City" hint="Used for every draft. You can change one later.">
          {(p) => (
            <Input
              {...p}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              list="idea-cities"
              autoComplete="off"
            />
          )}
        </Field>
        <datalist id="idea-cities">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {many && (
          <section aria-label="Preview" className="space-y-2">
            <h3 className="font-display text-[17px] font-extrabold">
              {kept.length} {kept.length === 1 ? "draft" : "drafts"} will be created
            </h3>
            <ul className="overflow-hidden rounded-2xl bg-surface-2">
              {kept.map((i) => {
                const Icon = KIND_ICON[kind];
                return (
                  <li
                    key={i.name}
                    className="flex min-h-12 items-center gap-2.5 border-b border-line py-1 pr-1 pl-3.5 last:border-b-0"
                  >
                    <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-bold">{i.name}</span>
                    {i.price !== null ? (
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-sm font-bold">
                        {formatMoney(i.price, trip.home_currency)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-medium text-fg-muted">No price</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemoved((r) => new Set(r).add(i.name.toLowerCase()))}
                      aria-label={`Remove ${i.name}`}
                      className="grid size-11 shrink-0 place-items-center text-fg-muted hover:text-fg"
                    >
                      <X className="size-[18px]" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {skipped > 0 && (
              <p className="text-[13px] text-fg-muted">
                {skipped} duplicate or extra {skipped === 1 ? "line was" : "lines were"} skipped.
              </p>
            )}
          </section>
        )}
        <p className="hidden items-center gap-2 text-[13px] text-fg-muted lg:flex">
          Add with <kbd className="rounded-md bg-surface-2 px-1.5 font-mono text-xs ring-1 ring-line-strong">Ctrl</kbd>+
          <kbd className="rounded-md bg-surface-2 px-1.5 font-mono text-xs ring-1 ring-line-strong">Enter</kbd>
          &middot; open this from anywhere with
          <kbd className="rounded-md bg-surface-2 px-1.5 font-mono text-xs ring-1 ring-line-strong">N</kbd>
        </p>
      </form>
    </Sheet>
  );
}
