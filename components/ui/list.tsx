import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useCanEdit } from "@/components/trip-gate";
import { cn } from "@/lib/utils";

export function List({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-border", className)} {...props} />;
}

/** A tappable list row (min 56px) that opens an edit sheet. */
export function ListButton({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  label,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  label?: string;
}) {
  const canEdit = useCanEdit();
  if (!canEdit) {
    return (
      <li className="flex min-h-14 items-center gap-3 px-1 py-2">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-sm text-fg-muted">{subtitle}</span>}
        </span>
        {trailing}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-surface-2"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-sm text-fg-muted">{subtitle}</span>}
        </span>
        {trailing}
        <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden />
      </button>
    </li>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-fg-muted">{children}</p>;
}
