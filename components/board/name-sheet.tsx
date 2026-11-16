"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { VOTE_LABEL, type Idea, type VoteValue } from "@/lib/drafts";
import { useSetMyName } from "@/lib/queries/ideas";

/** Asked once, at a person's first vote. Viewers may be anonymous, so the name is what everyone sees. */
export function NameSheet({
  idea,
  value,
  onDone,
  onCancel,
}: {
  idea: Idea;
  value: VoteValue;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const save = useSetMyName();
  const clean = name.trim();
  const submit = () => {
    if (!clean || save.isPending) return;
    save.mutate(clean, { onSuccess: onDone });
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onCancel()}
      title="What should we call you?"
      description="The trip owner and the others will see this next to your votes and comments. Only people on this trip can see it."
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" disabled={!clean || save.isPending} onClick={submit}>
            Save and vote
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
        <Field label="Your name" hint="You can change it any time in Settings.">
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              autoFocus
            />
          )}
        </Field>
        <p className="flex items-center gap-2.5 rounded-2xl bg-teal-tint px-3.5 py-3 text-sm font-medium text-teal">
          <Check className="size-[18px] shrink-0" strokeWidth={2.8} aria-hidden />
          <span>
            Your vote: <b>{VOTE_LABEL[value]}</b> on {idea.name}
          </span>
        </p>
      </form>
    </Sheet>
  );
}
