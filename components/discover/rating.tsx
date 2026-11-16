import { Star } from "lucide-react";
import type { PlaceCard } from "@/lib/places/types";
import { cn } from "@/lib/utils";

const PRICE_TEXT = ["Free", "Inexpensive", "Moderate", "Expensive", "Very expensive"];

/** Five stars, filled to the nearest whole star. Decoration: the number beside it carries the meaning. */
export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex gap-px" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={cn("size-3.5", i < full ? "fill-current text-[var(--star)]" : "text-line-strong")}
          strokeWidth={1.8}
        />
      ))}
    </span>
  );
}

export function RatingRow({ card }: { card: Pick<PlaceCard, "rating" | "ratingCount"> }) {
  if (card.rating === null) return <p className="text-sm text-fg-muted">No rating yet</p>;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
      <span className="font-mono font-bold text-fg tabular-nums">{card.rating.toFixed(1)}</span>
      <Stars value={card.rating} />
      {card.ratingCount !== null && (
        <span>
          <span className="sr-only">from </span>({card.ratingCount.toLocaleString("en-US")}
          <span className="sr-only"> ratings</span>)
        </span>
      )}
    </p>
  );
}

/** "Museum · $ · Open now" on one line. */
export function MetaRow({ card }: { card: Pick<PlaceCard, "type" | "priceLevel" | "openNow"> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <TypeLine card={card} />
      {card.openNow !== null && <span aria-hidden className="size-1 rounded-full bg-fg-muted" />}
      <OpenNow openNow={card.openNow} />
    </span>
  );
}

/** "Museum · $": our own symbols for Google's price level, with the words for screen readers. */
export function TypeLine({ card }: { card: Pick<PlaceCard, "type" | "priceLevel"> }) {
  const price = card.priceLevel;
  return (
    <p className="text-sm text-fg-muted">
      {card.type ?? "Place"}
      {price !== null && price > 0 && (
        <>
          <span aria-hidden> · </span>
          <span className="font-bold text-fg" aria-label={PRICE_TEXT[price]}>
            {"$".repeat(price)}
          </span>
        </>
      )}
    </p>
  );
}

export function OpenNow({ openNow }: { openNow: boolean | null }) {
  if (openNow === null) return null;
  return (
    <p className={cn("text-sm font-bold", openNow ? "text-teal" : "text-fg-muted")}>
      {openNow ? "Open now" : "Closed now"}
    </p>
  );
}
