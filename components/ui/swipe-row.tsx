"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const THRESHOLD = 96;
const LONG_PRESS_MS = 500;

/**
 * List row with touch gestures: swipe left to delete, tap or long-press to edit.
 * The row is a real <button> so keyboard and screen-reader users get the same
 * "edit" action (delete lives in the edit sheet).
 */
export function SwipeRow({
  children,
  onOpen,
  onSwipeDelete,
  label,
  className,
}: {
  children: ReactNode;
  onOpen: () => void;
  onSwipeDelete: () => void;
  label: string;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const g = useRef({ x: 0, y: 0, dragging: false, cancelled: false, longPressed: false, timer: 0 });

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    g.current = { x: e.clientX, y: e.clientY, dragging: false, cancelled: false, longPressed: false, timer: 0 };
    g.current.timer = window.setTimeout(() => {
      g.current.longPressed = true;
      navigator.vibrate?.(10);
      onOpen();
    }, LONG_PRESS_MS);
    setSettling(false);
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    const s = g.current;
    if (!s.timer && !s.dragging) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.dragging && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      clearTimeout(s.timer);
      s.timer = 0;
      if (Math.abs(mx) > Math.abs(my) && mx < 0) {
        s.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else s.cancelled = true; // vertical scroll: let the page handle it
    }
    if (s.dragging) setDx(Math.min(0, mx));
  }

  function up() {
    const s = g.current;
    clearTimeout(s.timer);
    s.timer = 0;
    if (s.dragging) {
      setSettling(true);
      if (dx <= -THRESHOLD) {
        setDx(-window.innerWidth);
        window.setTimeout(onSwipeDelete, 180);
      } else setDx(0);
    }
  }

  return (
    <li className={cn("relative overflow-hidden rounded-xl", className)}>
      <div
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-danger px-5 text-danger-fg"
        aria-hidden
      >
        <Trash2 className="size-5" />
      </div>
      <button
        type="button"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(e) => {
          if (e.detail === 0) return onOpen(); // keyboard activation
          const s = g.current;
          if (s.dragging || s.longPressed || s.cancelled) {
            e.preventDefault();
            s.dragging = false;
            return;
          }
          onOpen();
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ transform: `translateX(${dx}px)` }}
        className={cn(
          "relative flex min-h-14 w-full touch-pan-y items-center gap-3 bg-surface px-1 py-2 text-left select-none",
          settling && "transition-transform duration-200",
        )}
      >
        {children}
      </button>
    </li>
  );
}
