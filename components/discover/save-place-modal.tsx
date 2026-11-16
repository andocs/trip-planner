"use client";

import { useQueryClient } from "@tanstack/react-query";
import { IdeaModal } from "@/components/ideas/idea-modal";
import { KIND_OF_TABLE } from "@/lib/drafts";
import type { PlaceCard, PlaceKind, WikiPhoto } from "@/lib/places/types";
import { useSavePlace } from "@/lib/queries/places";

/**
 * Save a suggestion to the board: the same add form as everywhere else, opened with the Google result's name and
 * area filled in. Google's name can't be stored, so the name is the owner's own label (editable). Only the place
 * ID, coordinates (30 days) and a licensed Wikimedia photo are kept with it. No extra Google call is made.
 */
export function SavePlaceModal({
  card,
  kind,
  cities,
  city,
  onClose,
}: {
  card: PlaceCard;
  kind: PlaceKind;
  cities: string[];
  city: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useSavePlace();
  return (
    <IdeaModal
      kind={kind}
      prefill={{ name: card.name, city }}
      cities={cities}
      onClose={onClose}
      pending={save.isPending}
      submitLabel="Add draft"
      note="Your own label: edit the name however you like. Saved as a draft linked to the Google place. Ratings, hours and photos stay with Google and load live, so they are never copied into your plan."
      onCreate={(payload, done) => {
        const photo = qc.getQueryData<WikiPhoto | null>(["places", "wiki", card.id]) ?? null;
        save.mutate(
          { kind: KIND_OF_TABLE[payload.table], label: payload.name, city: payload.city, card, photo, payload },
          { onSuccess: done },
        );
      }}
    />
  );
}
