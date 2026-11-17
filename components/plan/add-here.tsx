"use client";

import { Car, Coffee, MapPin, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CategoryMenu } from "./category-menu";

/**
 * The control that belongs to one activity, as its own list row under it: a 64px band, centred. Nothing shows until
 * the band is hovered (a phone has no hover, so the circle is always there), then a 44px circle. Hovering (after a
 * 60 ms pause, so sweeping the mouse across the page opens nothing), focusing or tapping the circle opens it sideways
 * into one line: Commute | Rest | Activity. The look and the motion are in globals.css (`.add-fan`).
 */
export function AddHere({
  label,
  onCommute,
  onRest,
  onActivity,
}: {
  /** The activity it sits under, for the accessible names. */
  label: string;
  onCommute: () => void;
  onRest: () => void;
  /** Called with the category chosen from the menu (its label, e.g. "Food & Drink"). */
  onActivity: (category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // While the category menu is up the fan stays open behind it.
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hoverIn = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 60);
  };
  const hoverOut = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    // The 54px on the left is the dotted line's column (40px node + 14px gap): the control is centred on the cards, not on the whole list.
    <li className="add-zone relative z-[6] -mt-5 ml-[54px] flex h-16 items-center justify-center">
      <div
        role="group"
        aria-label={`After ${label}`}
        data-open={open || menuOpen}
        className="add-fan"
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
      >
        <button type="button" className="add-fan-trigger" aria-label={`Add after ${label}`} aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="add-fan-dot">
            <Plus className="size-4" strokeWidth={3} aria-hidden />
          </span>
        </button>
        <span className="add-fan-items">
          <button type="button" onClick={choose(onCommute)}>
            <Car className="size-[18px]" strokeWidth={2.4} aria-hidden />
            Commute
          </button>
          <button type="button" onClick={choose(onRest)}>
            <Coffee className="size-[18px]" strokeWidth={2.4} aria-hidden />
            Rest
          </button>
          <CategoryMenu
            heading="Add which kind of activity?"
            align="end"
            onPick={(c) => {
              setMenuOpen(false);
              choose(() => onActivity(c))();
            }}
          >
            <button type="button" aria-haspopup="menu" onClick={() => setMenuOpen(true)}>
              <MapPin className="size-[18px]" strokeWidth={2.4} aria-hidden />
              Activity
            </button>
          </CategoryMenu>
        </span>
      </div>
    </li>
  );
}
