"use client";

import { useState } from "react";
import { Camera, Clock, ExternalLink, Info, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { mapsLinkFor } from "@/lib/places/normalize";
import type { PlaceCard, PlaceKind } from "@/lib/places/types";
import { PlacesClientError, usePlaceDetails } from "@/lib/queries/places";
import { PhotoTile, creditText } from "./place-card";
import { MetaRow, RatingRow } from "./rating";
import { usePlacePhoto } from "./use-place-photo";

/**
 * A place in full. The weekly hours cost one Enterprise call, so they load only when the owner asks for them; the
 * open-now line and the description come from the search. Everything is loaded live and never stored.
 */
export function PlaceSheet({
  card,
  kind,
  saved,
  onClose,
  onSave,
}: {
  card: PlaceCard;
  kind: PlaceKind;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const photo = usePlacePhoto(card, { enabled: true, google: true });
  const [wantHours, setWantHours] = useState(false);
  const details = usePlaceDetails(card.id, wantHours);
  const credit = creditText(photo);
  const link = card.mapsUri ?? mapsLinkFor(card.id);
  const hoursError =
    details.error instanceof PlacesClientError ? details.error.message : "Couldn't load the opening hours.";

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={card.name}
      side
      description="Suggestion from Google Maps"
      footer={
        saved ? (
          <p className="py-2 text-center font-bold text-teal">On your board</p>
        ) : (
          <Button size="lg" className="w-full" onClick={onSave}>
            <Plus className="size-[18px]" strokeWidth={2.8} aria-hidden />
            Save to board
          </Button>
        )
      }
    >
      <div className="space-y-3.5 pt-1">
        <PhotoTile photo={photo} kind={kind} name={card.name} className="aspect-[2/1] w-full !rounded-[18px]" />
        <p className="-mt-1.5 flex items-start gap-2 text-[13px] text-fg-muted">
          <Camera className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
          <span>
            {credit ?? "No photo found for this place."}
            {photo.kind === "wiki" && (
              <>
                <br />
                <a
                  href={photo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-bold text-teal"
                >
                  View on Wikimedia Commons
                </a>
              </>
            )}
          </span>
        </p>
        <div className="space-y-0.5">
          <RatingRow card={card} />
          <MetaRow card={card} />
        </div>
        {card.description && <p className="text-base leading-snug text-fg">{card.description}</p>}
        {card.address && (
          <p className="flex min-h-11 items-center gap-2.5">
            <MapPin className="size-5 shrink-0 text-fg-muted" strokeWidth={2.2} aria-hidden />
            {card.address}
          </p>
        )}
        {!wantHours ? (
          <Button variant="secondary" size="sm" className="w-full" onClick={() => setWantHours(true)}>
            <Clock className="size-[18px]" strokeWidth={2.4} aria-hidden />
            Show opening hours
          </Button>
        ) : details.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : details.isError ? (
          <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-fg-muted">{hoursError}</p>
        ) : details.data.weekdayText.length > 0 ? (
          <ul
            aria-label="Opening hours"
            className="space-y-1 rounded-2xl bg-surface-2 px-3.5 py-3 font-mono text-sm tabular-nums"
          >
            {details.data.weekdayText.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2.5 font-bold text-teal"
        >
          <ExternalLink className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
          Open in Google Maps
        </a>
        <p className="flex items-start gap-2 text-[13px] text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
          <span>
            Details from <b className="text-fg">Google Maps</b>, loaded live when you open this. Only the place link is
            kept on your board.
          </span>
        </p>
      </div>
    </Sheet>
  );
}
