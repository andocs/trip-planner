"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useCanEdit } from "@/components/trip-gate";
import { cn } from "@/lib/utils";

const THRESHOLD = 96;
const LONG_PRESS_MS = 500;

/**
 * List row with touch gestures: swipe left to delete, tap or long-press to edit.
 * The main area is a real <button> (keyboard / screen-reader "edit"); `leading` and
 * `trailing` hold their own controls (checkbox, status chip) beside it, never nested inside.
 * Delete for non-touch users lives in the edit sheet.
 */
export function SwipeRow({
  children,
  leading,
  trailing,
  below,
  onOpen,
  onSwipeDelete,
  label,
  className,
}: {
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Rendered under the row (e.g. an expanded panel); not part of the swipe. */
  below?: ReactNode;
  onOpen: () => void;
  onSwipeDelete: () => void;
  label: string;
  className?: string;
}) {
  const canEdit = useCanEdit();
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const g = useRef({ x: 0, y: 0, dragging: false, suppressClick: false, timer: 0 });

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    g.current = { x: e.clientX, y: e.clientY, dragging: false, suppressClick: false, timer: 0 };
    g.current.timer = window.setTimeout(() => {
      g.current.suppressClick = true;
      g.current.timer = 0;
      navigator.vibrate?.(10);
      onOpen();
    }, LONG_PRESS_MS);
    setSettling(false);
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const s = g.current;
    if (!s.timer && !s.dragging) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.dragging && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      clearTimeout(s.timer);
      s.timer = 0;
      s.suppressClick = true;
      if (Math.abs(mx) > Math.abs(my) && mx < 0) {
        s.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } // otherwise it's a vertical scroll: let the page handle it
    }
    if (s.dragging) setDx(Math.min(0, mx));
  }

  function up() {
    const s = g.current;
    clearTimeout(s.timer);
    s.timer = 0;
    if (!s.dragging) return;
    s.dragging = false;
    setSettling(true);
    if (dx <= -THRESHOLD) {
      setDx(-window.innerWidth);
      window.setTimeout(onSwipeDelete, 180);
    } else setDx(0);
  }

  // Viewers get the same row as plain content: no tap, swipe or long-press.
  if (!canEdit) {
    return (
      <li className={className}>
        <div className="flex min-h-14 w-full items-center gap-3 bg-surface px-1">
          {leading}
          <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">{children}</div>
          {trailing}
        </div>
        {below}
      </li>
    );
  }
  return (
    <li className={className}>
      <div className="relative overflow-hidden rounded-xl">
        {dx < 0 && (
          <div
            className="absolute inset-0 flex items-center justify-end rounded-xl bg-danger px-5 text-danger-fg"
            aria-hidden
          >
            <Trash2 className="size-5" />
          </div>
        )}
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
          style={{ transform: `translateX(${dx}px)` }}
          className={cn(
            "relative flex min-h-14 w-full touch-pan-y items-center gap-3 bg-surface px-1 select-none",
            settling && "transition-transform duration-200",
          )}
        >
          {leading}
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              if (e.detail !== 0 && g.current.suppressClick) return; // a drag or long-press, not a tap
              onOpen();
            }}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
          >
            {children}
          </button>
          {trailing}
        </div>
      </div>
      {below}
    </li>
  );
}
