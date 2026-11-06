/** Rules behind Home's "Next up" checklist (unit-tested). */

export type NextUpItem = { key: string; label: string; href: string; done: boolean };

export type NextUpInput = {
  hasDates: boolean;
  stops: number;
  travelers: number;
  flights: number;
  stays: number;
  itineraryItems: number;
  plannedCategories: number;
};

/** The setup checklist shown to the owner after the wizard. It disappears once everything is done. */
export function nextUp(i: NextUpInput): { items: NextUpItem[]; allDone: boolean } {
  const items: NextUpItem[] = [
    {
      key: "basics",
      label: "Dates, stops and travelers",
      href: "/settings",
      done: i.hasDates && i.stops > 0 && i.travelers > 0,
    },
    { key: "flights", label: "Add your flights", href: "/plan?tab=flights", done: i.flights > 0 },
    { key: "stays", label: "Add where you are staying", href: "/plan?tab=stays", done: i.stays > 0 },
    { key: "day1", label: "Plan day 1", href: "/plan", done: i.itineraryItems > 0 },
    { key: "budgets", label: "Set category budgets", href: "/spend", done: i.plannedCategories > 0 },
  ];
  return { items, allDone: items.every((x) => x.done) };
}

/** "Aq", "Aq and Jam", "Aq, Jam and Ko". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
