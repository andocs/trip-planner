"use client";

import type { FormEvent, ReactNode } from "react";
import { FormFooter } from "./form-footer";
import { Sheet } from "./sheet";

/**
 * Standard add/edit bottom sheet: fields in the body, and the shared footer pinned at the bottom
 * ([Delete] [Cancel] [Add or Save]). `keepAdding` (add mode only) renders the "keep adding" toggle above the buttons.
 */
export function RowSheet({
  open,
  onOpenChange,
  title,
  description,
  side,
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
  /** A short line under the title (e.g. the day an activity is being added to). */
  description?: string;
  /** From 768px up, a right-hand panel instead of a centred dialog (the standard for the larger forms). */
  side?: boolean;
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
      description={description}
      side={side}
      footer={
        <FormFooter
          mode={mode}
          formId={formId}
          submitLabel={submitLabel}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          onDelete={onDelete}
          keepAdding={keepAdding}
        />
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
        {children}
      </form>
    </Sheet>
  );
}
