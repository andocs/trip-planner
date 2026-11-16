"use client";

import { BedDouble, Landmark, Utensils, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Textarea } from "@/components/ui/field";
import { parseIdeaLines, type IdeaKind } from "@/lib/drafts";
import { formatMoney } from "@/lib/format";
import { useAddIdeas } from "@/lib/queries/ideas";

const KIND_ICON = { stay: BedDouble, food: Utensils, sight: Landmark };

export type PasteSummary = { count: number; pending: boolean };

/**
 * "Paste a list": every line becomes a draft of the chosen category, with an optional price after a dash
 * ("Sky Hotel - 3800"). It is the body of the shared add sheet, so the footer (Cancel and Add) belongs to the sheet:
 * this form only reports how many drafts are ready through `onSummary`. Ctrl/Cmd + Enter adds from the keyboard.
 */
export function PasteList({
  formId,
  kind,
  cities,
  onDone,
  onSummary,
}: {
  formId: string;
  kind: IdeaKind;
  cities: string[];
  onDone: () => void;
  onSummary: (s: PasteSummary) => void;
}) {
  const trip = useTrip();
  const add = useAddIdeas();
  const [text, setText] = useState("");
  const [city, setCity] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const { items, skipped } = useMemo(() => parseIdeaLines(text), [text]);
  const kept = items.filter((i) => !removed.has(i.name.toLowerCase()));
  const pending = add.isPending;

  useEffect(() => onSummary({ count: kept.length, pending }), [kept.length, pending, onSummary]);

  const submit = () => {
    if (kept.length === 0 || pending) return;
    add.mutate({ kind, city: city.trim() || null, items: kept }, { onSuccess: onDone });
  };

  const Icon = KIND_ICON[kind];
  return (
    <form
      id={formId}
      className="space-y-4 pt-1 pb-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Places, one per line" hint="Add a price after a dash: Sky Hotel - 3800. Every line becomes a draft; drafts don’t count toward the budget.">
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
            rows={5}
            autoFocus
            placeholder={"Old Quarter hotel - 3800\nBún chả Hương Liên\nTrain Street cafe"}
            className="resize-none leading-relaxed"
          />
        )}
      </Field>
      <Field label="City" hint="Used for every draft. You can change one later.">
        {(p) => <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} list="paste-cities" autoComplete="off" />}
      </Field>
      <datalist id="paste-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {items.length > 1 && (
        <section aria-label="Preview" className="space-y-2">
          <h3 className="font-display text-[17px] font-extrabold">
            {kept.length} {kept.length === 1 ? "draft" : "drafts"} will be created
          </h3>
          <ul className="overflow-hidden rounded-2xl bg-surface-2">
            {kept.map((i) => (
              <li key={i.name} className="flex min-h-12 items-center gap-2.5 border-b border-line py-1 pr-1 pl-3.5 last:border-b-0">
                <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-bold">{i.name}</span>
                {i.price !== null ? (
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-sm font-bold">{formatMoney(i.price, trip.home_currency)}</span>
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
            ))}
          </ul>
          {skipped > 0 && (
            <p className="text-[13px] text-fg-muted">
              {skipped} duplicate or extra {skipped === 1 ? "line was" : "lines were"} skipped.
            </p>
          )}
        </section>
      )}
    </form>
  );
}
