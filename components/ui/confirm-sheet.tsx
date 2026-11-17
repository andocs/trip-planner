"use client";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** A small "are you sure?": a title, one line of why, and Cancel / confirm. A dialog on desktop, a bottom sheet on a phone. */
export function ConfirmSheet({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <span className="sr-only">Confirm or cancel</span>
    </Sheet>
  );
}
