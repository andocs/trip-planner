"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BedDouble, Landmark, Link2, Utensils } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { KIND_LABEL, type PlaceCard, type PlaceKind, type WikiPhoto } from "@/lib/places/types";
import { useSavePlace } from "@/lib/queries/places";
import { cn } from "@/lib/utils";

const KINDS: { value: PlaceKind; icon: typeof BedDouble }[] = [
  { value: "stay", icon: BedDouble },
  { value: "food", icon: Utensils },
  { value: "sight", icon: Landmark },
];

/**
 * Save a suggestion to the board as a draft. Google's name can't be stored, so the owner confirms their own label
 * (prefilled, editable). Only the place ID, coordinates (30 days) and a licensed Wikimedia photo are kept with it.
 */
export function SavePlaceSheet({
  card,
  kind: initialKind,
  cities,
  city: initialCity,
  onClose,
}: {
  card: PlaceCard;
  kind: PlaceKind;
  cities: string[];
  city: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useSavePlace();
  const [label, setLabel] = useState(card.name);
  const [kind, setKind] = useState<PlaceKind>(initialKind);
  const [city, setCity] = useState(initialCity);
  const valid = label.trim().length > 0 && label.trim().length <= 120;

  const submit = () => {
    if (!valid || save.isPending) return;
    const photo = qc.getQueryData<WikiPhoto | null>(["places", "wiki", card.id]) ?? null;
    save.mutate({ kind, label: label.trim(), city: city || null, card, photo }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save to board"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" disabled={!valid || save.isPending} onClick={submit}>
            Add draft
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
        <Field label="Name on your board" hint="Your own label. Edit it however you like.">
          {(p) => (
            <Input {...p} value={label} maxLength={120} autoComplete="off" onChange={(e) => setLabel(e.target.value)} />
          )}
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-fg-muted">Type</span>
          <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 rounded-full bg-surface-2 p-1">
            {KINDS.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold",
                  kind === value
                    ? "bg-surface text-fg shadow-[0_1px_3px_rgb(0_0_0/0.16)] dark:bg-ink dark:text-ground dark:shadow-none"
                    : "text-fg-muted",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={2.4} aria-hidden />
                {KIND_LABEL[value].replace(/s$/, "")}
              </button>
            ))}
          </div>
        </div>
        <Field label="City">
          {(p) => (
            <Select {...p} value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-fg-muted">
          <Link2 className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
          <span>
            Saved as a draft linked to the Google place. Ratings, hours and photos stay with Google and load live, so
            they are never copied into your plan.
          </span>
        </p>
      </form>
    </Sheet>
  );
}
