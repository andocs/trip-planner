"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { ideaKey, type IdeaTable } from "@/lib/drafts";
import type { IdeaPayload } from "@/lib/idea-form";
import {
  PLACES_MESSAGES,
  type PlaceCard,
  type PlaceDetails,
  type PlaceKind,
  type PlacesErrorCode,
  type WikiPhoto,
} from "@/lib/places/types";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { addWikimediaPhoto } from "./images";
import { qk } from "./keys";
import { newId, useRows, type Row } from "./table";

/** What a failed /api/places call looks like to the screen: a fixed code and a message written for the owner. */
export class PlacesClientError extends Error {
  constructor(readonly code: PlacesErrorCode) {
    super(PLACES_MESSAGES[code]);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PlacesClientError("unavailable");
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: PlacesErrorCode } | null;
    throw new PlacesClientError(j?.error && j.error in PLACES_MESSAGES ? j.error : "unavailable");
  }
  return (await res.json()) as T;
}

export type City = { name: string; lat: number; lng: number };

/** The trip's destinations that have coordinates: the cities Discover can search. */
export function useCities(): City[] {
  const rows = useRows("destinations");
  return (rows.data ?? [])
    .filter((d) => d.lat !== null && d.lng !== null)
    .map((d) => ({ name: d.city, lat: d.lat as number, lng: d.lng as number }));
}

/**
 * Google data is paid per call, so none of these queries refetches on its own: no refetch on focus, reconnect or
 * mount, and a stale time that never expires inside a session. The owner presses "Search again" to pay for new results.
 * The data lives only in this tab's memory (it is never written to storage or the database).
 */
const ONCE = {
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

export const searchKey = (kind: PlaceKind, city: City) => ["places", "search", kind, city.lat, city.lng] as const;

export function useSuggestions(kind: PlaceKind, city: City | undefined) {
  return useQuery({
    queryKey: city ? searchKey(kind, city) : ["places", "search", "none"],
    queryFn: async () => (await post<{ places: PlaceCard[] }>("/api/places/search", { kind, city })).places,
    enabled: !!city,
    ...ONCE,
  });
}

/** A free Wikimedia Commons photo for a card (null when none matches). Loaded once the card is on screen. */
export function useWikiPhoto(card: Pick<PlaceCard, "id" | "name" | "lat" | "lng">, enabled = true) {
  return useQuery({
    queryKey: ["places", "wiki", card.id],
    queryFn: async () =>
      (await post<{ photo: WikiPhoto | null }>("/api/places/image", { name: card.name, lat: card.lat, lng: card.lng }))
        .photo,
    enabled,
    ...ONCE,
  });
}

/** Opening hours: one Enterprise call, only when the owner asks to see them. */
export function usePlaceDetails(placeId: string, enabled = true) {
  return useQuery({
    queryKey: ["places", "details", placeId],
    queryFn: () => post<PlaceDetails>("/api/places/details", { placeId }),
    enabled,
    ...ONCE,
  });
}

/** A Google photo (Photos SKU, scarce): only when the owner opens a place that has no free photo. */
export function useGooglePhoto(name: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["places", "photo", name],
    queryFn: async () => ({ uri: (await post<{ uri: string }>("/api/places/photo", { name })).uri }),
    enabled: enabled && !!name,
    ...ONCE,
  });
}

export type PlaceRef = Row<"place_refs">;

/** Every saved link from an idea to a Google place, indexed by idea key (`attractions:<id>`). Realtime keeps it current. */
export function usePlaceRefs() {
  const rows = useRows("place_refs");
  const byIdea = new Map<string, PlaceRef>();
  const byPlace = new Map<string, PlaceRef>();
  for (const r of rows.data ?? []) {
    byIdea.set(ideaKey(r.item_table as IdeaTable, r.item_id), r);
    byPlace.set(r.place_id, r);
  }
  return { byIdea, byPlace, isPending: rows.isPending };
}

/** Coordinates are only trusted for 30 days after they were fetched; older ones are treated as gone. */
export const COORD_DAYS = 30;
export function freshCoords(r: PlaceRef | undefined, now = Date.now()): { lat: number; lng: number } | null {
  if (!r || r.lat === null || r.lng === null || !r.coords_at) return null;
  return now - new Date(r.coords_at).getTime() < COORD_DAYS * 86_400_000 ? { lat: r.lat, lng: r.lng } : null;
}

const TABLE: Record<PlaceKind, IdeaTable> = { sight: "attractions", food: "food_places", stay: "hotel_ideas" };

/**
 * Save a suggestion to the board as a draft. What is stored: the owner's own label, the place ID, coordinates with
 * a timestamp (30-day limit) and, if there is one, the Wikimedia photo with its licence (as an item_images row).
 * Never Google's name, rating, hours or photos.
 */
export function useSavePlace() {
  const trip = useTrip();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      kind: PlaceKind;
      label: string;
      city: string | null;
      card: PlaceCard;
      photo: WikiPhoto | null;
      /** From the shared modal: every column and the category details. Without it, a bare draft is saved. */
      payload?: IdeaPayload;
    }) => {
      const db = getSupabase();
      const table = v.payload ? v.payload.table : TABLE[v.kind];
      const id = newId();
      const base = { id, trip_id: trip.id, city: v.city };
      const first = v.payload
        ? await db.from(v.payload.table).insert({ ...base, ...v.payload.columns, ...v.payload.insertOnly } as never)
        : table === "hotel_ideas"
          ? await db.from("hotel_ideas").insert({ ...base, hotel: v.label, nights: 1, total: null })
          : await db.from(table).insert({ ...base, name: v.label, status: "Idea" });
      if (first.error) throw first.error;
      const ref = await db.from("place_refs").insert({
        id: newId(),
        trip_id: trip.id,
        item_table: table,
        item_id: id,
        place_id: v.card.id,
        lat: v.card.lat,
        lng: v.card.lng,
        coords_at: new Date().toISOString(),
      });
      if (ref.error) {
        // The idea exists without its place link: keep it (it is still a useful draft) and say so.
        toast.warning("Saved the idea, but couldn't link it to the Google place.");
      }
      // A free Wikimedia picture, if one was found, becomes the idea's first photo (with its author and licence).
      if (v.photo) await addWikimediaPhoto(trip.id, table, id, v.photo);
      return table;
    },
    onSuccess: (table) => {
      void qc.invalidateQueries({ queryKey: qk.table(table, trip.id) });
      void qc.invalidateQueries({ queryKey: qk.table("place_refs", trip.id) });
      void qc.invalidateQueries({ queryKey: qk.table("item_images", trip.id) });
      toast.success("Saved to the board as a draft.");
    },
    onError: (e) => toast.error(`Couldn't save it: ${errorMessage(e)}`),
  });
}

/** Deletes coordinates older than 30 days, once per session when the owner opens Discover. Best effort. */
export function purgeStaleCoords() {
  void getSupabase().rpc("purge_stale_place_coords");
}
