export const STATUSES = ["Idea", "Maybe", "Planned", "Priced", "Booked", "Done", "Cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const ITINERARY_TYPES = [
  "Transport",
  "Sightseeing",
  "Food & Drink",
  "Rest & Stay",
  "Activity",
  "Shopping",
  "Flight",
  "Other",
] as const;
export type ItineraryType = (typeof ITINERARY_TYPES)[number];

/** Each itinerary type keeps one chart-palette slot, so its colour never changes with filters. */
export const typeColor = (type: string | null) => {
  const i = ITINERARY_TYPES.indexOf((type ?? "Other") as ItineraryType);
  return `var(--chart-${(i < 0 ? 7 : i) + 1})`;
};
