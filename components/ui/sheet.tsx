"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Form container for every add/edit flow. A bottom sheet on phones (body scrolls, footer stays
 * pinned above the keyboard), a centered dialog from 768px up. The body and footer are shared.
 */
export function Sheet(props: SheetProps) {
  const dialog = useMedia("(min-width: 768px)");
  return dialog ? <CenteredDialog {...props} /> : <BottomSheet {...props} />;
}

function Body({ children, footer }: Pick<SheetProps, "children" | "footer">) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-border bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {footer}
        </div>
      )}
    </>
  );
}

const closeClass =
  "-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg";

function BottomSheet({ open, onOpenChange, title, description, children, footer, className }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface shadow-[var(--shadow-sheet)] outline-none",
            className,
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-2">
            <div>
              <Drawer.Title className="font-display text-2xl font-extrabold tracking-tight">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-fg-muted">{description}</Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{title}</Drawer.Description>
              )}
            </div>
            <Drawer.Close className={closeClass}>
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </Drawer.Close>
          </div>
          <Body footer={footer}>{children}</Body>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function CenteredDialog({ open, onOpenChange, title, description, children, footer, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(32.5rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-surface shadow-[0_24px_60px_rgb(0_0_0/0.3)] outline-none dark:shadow-[0_0_0_1px_var(--line),0_24px_60px_rgb(0_0_0/0.5)]",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div>
              <Dialog.Title className="font-display text-2xl font-extrabold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-fg-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className={closeClass}>
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <Body footer={footer}>{children}</Body>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
