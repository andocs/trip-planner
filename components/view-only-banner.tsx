"use client";

import { Eye } from "lucide-react";
import { useCanEdit } from "@/components/trip-gate";

/** Shown to viewers only: says why there are no edit controls. */
export function ViewOnlyBanner() {
  if (useCanEdit()) return null;
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2.5 rounded-[14px] bg-teal-tint px-3.5 py-2.5 text-sm font-bold text-teal"
    >
      <Eye className="size-[18px] shrink-0" aria-hidden />
      <span>
        View only <span className="font-medium text-fg-muted">· only the trip owner can make changes</span>
      </span>
    </div>
  );
}

/** Empty-state copy: owners get the nudge to add something; viewers are told the owner is still planning. */
export function EmptyText({ children }: { children: React.ReactNode }) {
  return useCanEdit() ? <>{children}</> : <>Nothing here yet. The trip owner is still planning.</>;
}
