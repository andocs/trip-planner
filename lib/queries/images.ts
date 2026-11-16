"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCanEdit, useTrip } from "@/components/trip-gate";
import { ideaKey, type Idea, type IdeaTable } from "@/lib/drafts";
import { PhotoFileError, PROBLEM_TEXT, resizeForUpload } from "@/lib/photos/resize";
import { BUCKET, MAX_PER_IDEA, byPosition, closeGaps, coverMoves, nextPosition } from "@/lib/photos/shared";
import type { WikiPhoto } from "@/lib/places/types";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { newId, useRows, type Row } from "./table";

export type ImageRow = Row<"item_images">;

/** Every photo of the trip, indexed by idea key, each list cover-first. Realtime keeps it current. */
export function useImages() {
  const rows = useRows("item_images", byPosition);
  const byIdea = new Map<string, ImageRow[]>();
  for (const r of rows.data ?? []) {
    const k = ideaKey(r.item_table as IdeaTable, r.item_id);
    byIdea.set(k, [...(byIdea.get(k) ?? []), r]);
  }
  return { byIdea, all: rows.data ?? [], isPending: rows.isPending };
}

/**
 * Uploaded photos live in a private bucket, so each one is shown through a short-lived signed link. One batch call
 * signs every upload of the trip (and is reused for 45 minutes), so a board of twenty cards costs one request.
 * Links to other sites and Wikimedia pictures are used as they are.
 */
export function usePhotoUrls() {
  const trip = useTrip();
  const { all } = useImages();
  const paths = all
    .filter((i) => i.source === "upload" && i.storage_path)
    .map((i) => i.storage_path as string)
    .sort();
  const q = useQuery({
    queryKey: ["photo-urls", trip.id, paths.join(",")],
    queryFn: async () => {
      const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
      return map;
    },
    enabled: paths.length > 0,
    staleTime: 45 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
  return (row: ImageRow): string | null =>
    row.source === "upload" ? (q.data?.get(row.storage_path ?? "") ?? null) : row.url;
}

/** Used / cap bytes of photo storage (owner only). The cap is enforced by the database, this only draws the meter. */
export function usePhotoStorage() {
  const canEdit = useCanEdit();
  return useQuery({
    queryKey: ["photo-storage"],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("photo_storage_status");
      if (error) throw error;
      const row = data?.[0];
      return { used: Number(row?.used ?? 0), cap: Number(row?.cap ?? 0) };
    },
    enabled: canEdit,
    staleTime: 30_000,
    retry: false,
  });
}

/** What the link route found on a pasted page (see /api/photos/link). */
export type FoundPicture = { imageUrl: string; pageUrl: string | null; site: string };
export class LinkProblem extends Error {}

export async function findPicture(url: string): Promise<FoundPicture> {
  let res: Response;
  try {
    res = await fetch("/api/photos/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new LinkProblem("Couldn't reach the server. Check your connection.");
  }
  const j = (await res.json().catch(() => null)) as { found?: FoundPicture; message?: string } | null;
  if (!res.ok || !j?.found) throw new LinkProblem(j?.message ?? "Couldn't get a picture from that link.");
  return j.found;
}

const STORAGE_FULL = "Photo storage is full, or you can't add photos here.";

function useInvalidate() {
  const trip = useTrip();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.table("item_images", trip.id) });
    void qc.invalidateQueries({ queryKey: ["photo-storage"] });
  };
}

/** Add a picture by link (we keep the address, not a copy). */
export function useAddLinkPhoto() {
  const trip = useTrip();
  const { byIdea } = useImages();
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (v: { idea: Pick<Idea, "table" | "id" | "key">; found: FoundPicture; credit: string }) => {
      const existing = byIdea.get(v.idea.key) ?? [];
      if (existing.length >= MAX_PER_IDEA) throw new Error(`An idea can have at most ${MAX_PER_IDEA} photos.`);
      const { error } = await getSupabase()
        .from("item_images")
        .insert({
          id: newId(),
          trip_id: trip.id,
          item_table: v.idea.table,
          item_id: v.idea.id,
          source: "link",
          url: v.found.imageUrl,
          page_url: v.found.pageUrl,
          credit: v.credit.trim().slice(0, 200) || v.found.site,
          position: nextPosition(existing),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      done();
      toast.success("Photo added.");
    },
    onError: (e) => toast.error(`Couldn't add the photo: ${errorMessage(e)}`),
  });
}

/** Shrink on the phone, upload to the private bucket, then record it. If recording fails the file is removed again. */
export function useUploadPhoto() {
  const trip = useTrip();
  const { byIdea } = useImages();
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      idea: Pick<Idea, "table" | "id" | "key">;
      file: File;
      onStage?: (s: "resizing" | "uploading") => void;
    }) => {
      const existing = byIdea.get(v.idea.key) ?? [];
      if (existing.length >= MAX_PER_IDEA) throw new Error(`An idea can have at most ${MAX_PER_IDEA} photos.`);
      v.onStage?.("resizing");
      const { blob } = await resizeForUpload(v.file);
      v.onStage?.("uploading");
      const db = getSupabase();
      const path = `${trip.id}/${newId()}.jpg`;
      const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error)
        throw new Error(/row-level|policy|403|unauthor/i.test(up.error.message) ? STORAGE_FULL : up.error.message);
      const row = await db.from("item_images").insert({
        id: newId(),
        trip_id: trip.id,
        item_table: v.idea.table,
        item_id: v.idea.id,
        source: "upload",
        storage_path: path,
        position: nextPosition(existing),
      });
      if (row.error) {
        await db.storage.from(BUCKET).remove([path]);
        throw row.error;
      }
      return blob.size;
    },
    onSuccess: () => {
      done();
      toast.success("Photo added.");
    },
    onError: (e) =>
      toast.error(e instanceof PhotoFileError ? PROBLEM_TEXT[e.problem] : `Couldn't add the photo: ${errorMessage(e)}`),
  });
}

/** Remove a photo (and its file, for an upload). The next photo becomes the cover if the cover went. */
export function useRemovePhoto() {
  const done = useInvalidate();
  const { byIdea } = useImages();
  return useMutation({
    mutationFn: async (row: ImageRow) => {
      const db = getSupabase();
      const del = await db.from("item_images").delete().eq("id", row.id);
      if (del.error) throw del.error;
      if (row.storage_path) await db.storage.from(BUCKET).remove([row.storage_path]);
      const rest = (byIdea.get(ideaKey(row.item_table as IdeaTable, row.item_id)) ?? []).filter((r) => r.id !== row.id);
      for (const m of closeGaps(rest)) await db.from("item_images").update({ position: m.position }).eq("id", m.id);
    },
    onSuccess: () => {
      done();
      toast.success("Photo removed.");
    },
    onError: (e) => toast.error(`Couldn't remove the photo: ${errorMessage(e)}`),
  });
}

/** Make a photo the card's cover (position 0); the others keep their order. */
export function useMakeCover() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ rows, id }: { rows: ImageRow[]; id: string }) => {
      const db = getSupabase();
      for (const m of coverMoves(rows, id)) {
        const { error } = await db.from("item_images").update({ position: m.position }).eq("id", m.id);
        if (error) throw error;
      }
    },
    onSuccess: done,
    onError: (e) => toast.error(`Couldn't change the cover: ${errorMessage(e)}`),
  });
}

/** A Wikimedia picture found for a saved Google place becomes the idea's first photo. Best effort. */
export async function addWikimediaPhoto(tripId: string, table: IdeaTable, itemId: string, photo: WikiPhoto) {
  const { error } = await getSupabase()
    .from("item_images")
    .insert({
      id: newId(),
      trip_id: tripId,
      item_table: table,
      item_id: itemId,
      source: "wikimedia",
      url: photo.url,
      page_url: photo.pageUrl,
      credit: photo.author.slice(0, 200),
      license: photo.license.slice(0, 60),
      license_url: photo.licenseUrl,
      position: 0,
    });
  return !error;
}
