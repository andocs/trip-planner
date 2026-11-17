"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Idea } from "@/lib/drafts";
import type { Gate } from "@/lib/confirm-gate";

/**
 * The question before a place is confirmed: what is missing (blockers stop it, warnings don't), and for a stay that it
 * will also be added to the Stays page.
 */
export function ConfirmIdeaSheet({
  idea,
  gate,
  onConfirm,
  onEdit,
  onClose,
}: {
  idea: Idea;
  gate: Gate;
  onConfirm: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const blocked = gate.blockers.length > 0;
  const flagged = gate.warnings.length > 0;
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Confirm “${idea.name}”?`}
      description={
        idea.kind === "stay"
          ? "A confirmed stay is also added to the Stays page, as a planned booking."
          : "A confirmed place counts toward the budget and the exports."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {blocked ? (
            <Button size="sm" onClick={onEdit}>
              Edit details
            </Button>
          ) : (
            <Button size="sm" onClick={onConfirm}>
              {flagged ? "Confirm anyway" : "Confirm"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {blocked && (
          <section aria-label="To fix first" className="space-y-2">
            <h3 className="font-display text-[17px] font-extrabold">To fix first</h3>
            <ul className="space-y-1.5">
              {gate.blockers.map((b) => (
                <li key={b} className="flex items-start gap-2.5 rounded-2xl bg-danger-tint px-3.5 py-2.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </section>
        )}
        {flagged && (
          <section aria-label="Worth a look" className="space-y-2">
            <h3 className="font-display text-[17px] font-extrabold">Worth a look</h3>
            <ul className="space-y-1.5">
              {gate.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2.5 rounded-2xl bg-warn-tint px-3.5 py-2.5 text-sm text-warn-text">
                  <TriangleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!blocked && !flagged && <p className="text-sm text-fg-muted">Nothing is missing.</p>}
      </div>
    </Sheet>
  );
}
