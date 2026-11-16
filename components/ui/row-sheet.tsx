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
