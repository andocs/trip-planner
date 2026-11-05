"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Fab } from "@/components/ui/fab";
import type { Budget } from "@/lib/queries/budget";

/** The menu (and all its form code) is fetched on the first tap, keeping it out of Home's initial JS. */
const QuickAddMenu = dynamic(() => import("./quick-add-menu").then((m) => m.QuickAddMenu), { ssr: false });

/** The + button on Home: a menu of the most common "add" actions, each opening its own sheet. */
export function QuickAdd({ budget }: { budget: Budget }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Fab
        label="Quick add"
        onPointerEnter={() => void import("./quick-add-menu")}
        onClick={() => {
          setLoaded(true);
          setMenuOpen(true);
        }}
      />
      {loaded && <QuickAddMenu budget={budget} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />}
    </>
  );
}
