import type { CategoryLine } from "@/lib/queries/budget";

/** Colour follows the category (its position in the category list), never its rank by spend. */
export const seriesColor = (index: number) => (index >= 0 && index < 8 ? `var(--chart-${index + 1})` : "var(--muted)");

export type DonutSlice = { key: string; name: string; value: number; color: string };

/** Top 5 categories by spend; the rest fold into "Other" so the donut never exceeds 6 slices. */
export function donutSlices(lines: CategoryLine[]): DonutSlice[] {
  const withIndex = lines
    .map((l, i) => ({ l, color: l.category ? seriesColor(i) : "var(--muted)" }))
    .filter(({ l }) => l.spent > 0)
    .sort((a, b) => b.l.spent - a.l.spent);
  const top = withIndex
    .slice(0, 5)
    .map(({ l, color }) => ({ key: l.id ?? "none", name: l.name, value: l.spent, color }));
  const rest = withIndex.slice(5).reduce((s, { l }) => s + l.spent, 0);
  return rest > 0 ? [...top, { key: "other", name: "Other", value: rest, color: "var(--muted)" }] : top;
}
