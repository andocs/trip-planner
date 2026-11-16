"use client";

import { Trash2 } from "lucide-react";
import { Button } from "./button";

/**
 * The one footer for every add/edit form. "Keep adding" (add mode, when offered) sits above the buttons; the row is always
 * [Delete] [Cancel] [Add or Save], with Delete only when editing. The submit button belongs to `formId`.
 */
export function FormFooter({
  mode,
  formId,
  submitLabel,
  pending,
  onCancel,
  onDelete,
  keepAdding,
}: {
  mode: "add" | "edit";
  formId: string;
  submitLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  keepAdding?: { value: boolean; onChange: (v: boolean) => void };
}) {
  return (
    <div className="space-y-2">
      {mode === "add" && keepAdding && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium select-none">
          <input
            type="checkbox"
            className="size-5 accent-[var(--teal)]"
            checked={keepAdding.value}
            onChange={(e) => keepAdding.onChange(e.target.checked)}
          />
          Keep adding
        </label>
      )}
      <div className="flex items-center gap-3">
        {mode === "edit" && onDelete && (
          <Button type="button" variant="secondary" size="icon" onClick={onDelete} aria-label="Delete">
            <Trash2 className="size-5 text-danger" aria-hidden />
          </Button>
        )}
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId} size="lg" className="flex-1" disabled={pending}>
          {submitLabel ?? (mode === "add" ? "Add" : "Save")}
        </Button>
      </div>
    </div>
  );
}
