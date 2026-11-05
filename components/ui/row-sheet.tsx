"use client";

import { Trash2 } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

/**
 * Standard add/edit bottom sheet: fields in the body, the primary action pinned at the
 * bottom, and Delete when editing. `keepAdding` (add mode only) renders the
 * "keep adding" toggle used for rapid entry.
 */
export function RowSheet({
  open,
  onOpenChange,
  title,
  mode,
  onSubmit,
  onDelete,
  submitLabel,
  pending,
  keepAdding,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mode: "add" | "edit";
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  submitLabel?: string;
  pending?: boolean;
  keepAdding?: { value: boolean; onChange: (v: boolean) => void };
  children: ReactNode;
}) {
  const formId = `sheet-form-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex items-center gap-3">
          {mode === "edit" && onDelete && (
            <Button type="button" variant="secondary" size="icon" onClick={onDelete} aria-label="Delete">
              <Trash2 className="size-5 text-danger" aria-hidden />
            </Button>
          )}
          {mode === "add" && keepAdding && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium select-none">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={keepAdding.value}
                onChange={(e) => keepAdding.onChange(e.target.checked)}
              />
              Keep adding
            </label>
          )}
          <Button type="submit" form={formId} size="lg" className="flex-1" disabled={pending}>
            {submitLabel ?? (mode === "add" ? "Add" : "Save")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
        {children}
      </form>
    </Sheet>
  );
}
