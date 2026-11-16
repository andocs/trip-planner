/** Shared by the photo screens and tests. No browser or server code in here. */

export const BUCKET = "trip-photos";
export const MAX_PER_IDEA = 12;
export const MAX_EDGE = 1280;
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
export const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoSource = "upload" | "link" | "wikimedia";
export type PhotoLike = {
  id: string;
  source: string;
  credit: string | null;
  license: string | null;
  page_url: string | null;
  url: string | null;
  position: number;
  created_at: string;
};

/** Scale (w, h) down so the longer side is at most `max`. Never scales up. */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Cover first, then by position, then by age. */
export const byPosition = <T extends Pick<PhotoLike, "position" | "created_at">>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

/** The positions that make `coverId` first and keep the rest in their order. Only rows that change are returned. */
export function coverMoves<T extends Pick<PhotoLike, "id" | "position" | "created_at">>(
  rows: T[],
  coverId: string,
): { id: string; position: number }[] {
  const sorted = [...rows].sort(byPosition);
  const cover = sorted.find((r) => r.id === coverId);
  if (!cover) return [];
  const order = [cover, ...sorted.filter((r) => r.id !== coverId)];
  return order.flatMap((r, i) => (r.position === i ? [] : [{ id: r.id, position: i }]));
}

/** Positions that close the gap after a photo is removed (the next photo becomes the cover if the cover went). */
export function closeGaps<T extends Pick<PhotoLike, "id" | "position" | "created_at">>(
  rows: T[],
): { id: string; position: number }[] {
  return [...rows].sort(byPosition).flatMap((r, i) => (r.position === i ? [] : [{ id: r.id, position: i }]));
}

export const nextPosition = (rows: Pick<PhotoLike, "position">[]) =>
  rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;

/** The credit a photo must show, as plain text. null = nothing to credit (the owner's own upload). */
export function creditText(p: Pick<PhotoLike, "source" | "credit" | "license">): string | null {
  if (p.source === "wikimedia")
    return `Photo: ${p.credit ?? "Unknown author"}${p.license ? `, ${p.license}` : ""} · Wikimedia Commons`;
  if (p.source === "link") return p.credit ? `Photo from ${p.credit}` : "Photo from a link";
  return null;
}

/** The short label on a photo: where it came from. */
export function sourceLabel(p: Pick<PhotoLike, "source" | "credit" | "license">): string {
  if (p.source === "wikimedia") return `${p.credit ?? "Wikimedia"}${p.license ? ` · ${p.license}` : ""}`;
  if (p.source === "link") return p.credit ? `via ${p.credit}` : "Link";
  return "Uploaded";
}

export const formatBytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2
      ? `${Math.round(n / 1024 ** 2)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;
