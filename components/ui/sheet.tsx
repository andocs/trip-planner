"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet for every add/edit form. The body scrolls; `footer` stays pinned at the bottom
 * above the keyboard and the home indicator. On desktop it is a centered bottom panel.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface outline-none",
            className,
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-2">
            <div>
              <Drawer.Title className="text-lg font-bold">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-fg-muted">{description}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{title}</Drawer.Description>
              )}
            </div>
            <Drawer.Close className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-2">
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-border bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
