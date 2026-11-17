"use client";

import { BedDouble, Check, Ellipsis, Landmark, ShoppingBag, Sparkles, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What an activity can be. The label is what is saved as the activity's type; the first three also have their own details form. */
export const ACTIVITY_CATEGORIES: { label: string; icon: LucideIcon; hint: string }[] = [
  { label: "Sightseeing", icon: Landmark, hint: "Places, tours, views" },
  { label: "Food & Drink", icon: Utensils, hint: "Meals, cafés, bars" },
  { label: "Rest & Stay", icon: BedDouble, hint: "Check-in, nap, hotel time" },
  { label: "Activity", icon: Sparkles, hint: "Things to do" },
  { label: "Shopping", icon: ShoppingBag, hint: "Markets, malls" },
  { label: "Transport", icon: TrainFront, hint: "Rides and transfers" },
  { label: "Other", icon: Ellipsis, hint: "Anything else" },
];


/**
 * A menu of the activity categories around any trigger. Choosing one tells the caller which category is being added or set,
 * so the type is never typed by hand. `current` marks the chosen one (editing).
 */
export function CategoryMenu({
  children,
  onPick,
  current,
  align = "start",
  heading,
  onOpenChange,
}: {
  children: ReactNode;
  onPick: (label: string) => void;
  current?: string | null;
  align?: "start" | "center" | "end";
  heading?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="z-[70] min-w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
          {heading && <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-xs font-bold text-fg-muted">{heading}</DropdownMenu.Label>}
          {ACTIVITY_CATEGORIES.map(({ label, icon: Icon, hint }) => (
            <DropdownMenu.Item
              key={label}
              onSelect={() => onPick(label)}
              className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 outline-none data-[highlighted]:bg-surface-2", current === label && "bg-teal-tint text-teal")}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={2.3} aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="block text-sm leading-tight">{label}</b>
                <small className="block text-xs font-medium text-fg-muted">{hint}</small>
              </span>
              {current === label && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The icon of a category by its label. */
export function CategoryGlyph({ label, className }: { label: string | null | undefined; className?: string }) {
  const Icon = ACTIVITY_CATEGORIES.find((c) => c.label === label)?.icon ?? Landmark;
  return <Icon className={className} strokeWidth={2.3} aria-hidden />;
}
