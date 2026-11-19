"use client";

import { BedDouble, ChevronDown, Lightbulb, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { Idea } from "@/lib/drafts";
import type { Stay } from "@/lib/stays";

/**
 * The Stays page's "Add" menu, in a file of its own ON PURPOSE: the Stays page loads the stay form lazily (it pulls in the
 * big add-place sheet and its form code), and importing this menu from the same file as the form made that lazy load pointless.
 * Keep this file free of imports from stay-flow.tsx.
 */

/** What the Stays page is doing: nothing, choosing an existing idea, filling in the stay form, or adding a plan. */
export type StayStep = { step: "pick" } | { step: "form"; stay?: Stay; fromIdea?: Idea } | { step: "idea" };

/**
 * The Stays page's "Add" button: a final, confirmed stay (the usual choice: pick it from the places already on the
 * board), or a plan / idea (which lives on the Places board until it is confirmed).
 */
export function AddStayMenu({ onChoose, label = "Add", variant = "secondary" }: { onChoose: (s: StayStep) => void; label?: string; variant?: "secondary" | "primary" }) {
  const row = "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-left outline-none data-[highlighted]:bg-surface-2";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant={variant} className="shrink-0">
          <Plus className="size-4" aria-hidden />
          {label}
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-72 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
          <DropdownMenu.Item className={row} onSelect={() => onChoose({ step: "pick" })}>
            <BedDouble className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
            <span>
              <b className="block text-sm">Add a confirmed stay</b>
              <small className="text-[13px] text-fg-muted">A final booking. Pick it from your ideas.</small>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={row} onSelect={() => onChoose({ step: "idea" })}>
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden />
            <span>
              <b className="block text-sm">Add a plan or idea</b>
              <small className="text-[13px] text-fg-muted">Goes to Places as a draft to vote on.</small>
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
