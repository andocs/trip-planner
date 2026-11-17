"use client";

import { Lightbulb } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCanEdit } from "@/components/trip-gate";
import { cn } from "@/lib/utils";

const AddPlace = dynamic(() => import("./add-place").then((m) => m.AddPlace), { ssr: false });

const EVENT = "trip:add-idea";

/** Open the add sheet ("One place | Paste a list") from anywhere (a button, the Board, a keyboard shortcut). */
export function openAddIdea(opts: { paste?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: opts }));
}

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName));
};

/**
 * Scratch-first capture, reachable from every screen for people who can edit:
 * a floating button (hidden where the Board already has its own) and the `N` shortcut on desktop.
 */
export function CaptureHost() {
  const canEdit = useCanEdit();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const [state, setState] = useState<{ open: boolean; paste: boolean; n: number }>({ open: false, paste: false, n: 0 });

  useEffect(() => {
    if (!canEdit) return;
    const open = (paste = false) => setState((s) => ({ open: true, paste, n: s.n + 1 }));
    const onEvent = (e: Event) => open(!!(e as CustomEvent<{ paste?: boolean }>).detail?.paste);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      if (typing(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      open();
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, [canEdit]);

  if (!canEdit) return null;
  const boardShowing = pathname === "/places" && (tab === null || tab === "board");

  // The button is ALWAYS in the markup and is only hidden with CSS where the Board already has its own. Its presence
  // never depends on the address or query string, so the server HTML and the first browser render cannot disagree about
  // it (they used to, and React reported a hydration mismatch).
  return (
    <>
      <button
        type="button"
        onClick={() => setState((s) => ({ open: true, paste: false, n: s.n + 1 }))}
        onPointerEnter={() => void import("./add-place")}
        aria-label="Add idea"
        aria-keyshortcuts="N"
        aria-hidden={boardShowing || undefined}
        tabIndex={boardShowing ? -1 : undefined}
        // Phones have no floating button: they add from the Places page. From the lg breakpoint up it floats at the top right.
        className={cn(
          "fixed top-6 right-10 z-30 hidden items-center justify-center gap-2 rounded-full bg-surface px-4 font-bold text-fg shadow-float",
          !boardShowing && "lg:inline-flex",
        )}
      >
        <Lightbulb className="size-5" strokeWidth={2.4} aria-hidden />
        <span>Add idea</span>
        <kbd
          className="hidden rounded-md bg-surface-2 px-1.5 font-mono text-xs ring-1 ring-line-strong lg:inline"
          aria-hidden
        >
          N
        </kbd>
      </button>
      {state.open && <AddPlace key={state.n} startPaste={state.paste} onClose={() => setState((s) => ({ ...s, open: false }))} />}
    </>
  );
}
