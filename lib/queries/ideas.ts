"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useCanEdit, useTrip } from "@/components/trip-gate";
import {
  displayName,
  ideasFrom,
  ideaKey,
  type Decision,
  type Idea,
  type IdeaTable,
  type ParsedIdea,
  type VoteValue,
} from "@/lib/drafts";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { placeAtEndOfDay } from "./itinerary";
import { bookingForConfirm } from "@/lib/stay-sync";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "./table";
import { useUser } from "./trip";

/** Every hotel idea, food place and attraction as one list of cards. */
export function useIdeas() {
  const hotels = useRows("hotel_ideas");
  const food = useRows("food_places");
  const sights = useRows("attractions");
  const isPending = hotels.isPending || food.isPending || sights.isPending;
  const ideas: Idea[] = isPending
    ? []
    : ideasFrom({ hotel_ideas: hotels.data ?? [], food_places: food.data ?? [], attractions: sights.data ?? [] });
  return { ideas, isPending };
}

export type Vote = Row<"votes">;
export type Comment = Row<"comments">;

/** Votes and comments for the whole trip, indexed by idea key. Realtime keeps both current. */
export function useSocial() {
  const votes = useRows("votes");
  const comments = useRows("comments", (a, b) => a.created_at.localeCompare(b.created_at));
  const votesBy = new Map<string, Vote[]>();
  for (const v of votes.data ?? []) {
    const k = ideaKey(v.item_table as IdeaTable, v.item_id);
    votesBy.set(k, [...(votesBy.get(k) ?? []), v]);
  }
  const commentsBy = new Map<string, Comment[]>();
  for (const c of comments.data ?? []) {
    const k = ideaKey(c.item_table as IdeaTable, c.item_id);
    commentsBy.set(k, [...(commentsBy.get(k) ?? []), c]);
  }
  return { votesBy, commentsBy, isPending: votes.isPending || comments.isPending };
}

/** One cached list of the trip's people (labels only, never emails), shared by everything that needs a name. */
export const peopleKey = (tripId: string) => [...qk.members(tripId), "people"] as const;
export async function fetchPeople(tripId: string) {
  const { data, error } = await getSupabase().rpc("trip_people", { p_trip: tripId });
  if (error) throw error;
  return data ?? [];
}

/**
 * Who is who: user id -> display name. Loaded once (and warmed in the background), then re-fetched at
 * once whenever someone unknown votes or comments (the effect only re-runs when the set of unknown ids changes, so it cannot loop), so a new name shows up without a reload.
 */
export function usePeople() {
  const trip = useTrip();
  const { votesBy, commentsBy } = useSocial();
  const q = useQuery({ queryKey: peopleKey(trip.id), queryFn: () => fetchPeople(trip.id) });
  const names = new Map<string, string>();
  for (const p of q.data ?? []) names.set(p.user_id, displayName(p.label));

  const unknown: string[] = [];
  if (q.isSuccess)
    for (const list of [...votesBy.values(), ...commentsBy.values()])
      for (const r of list) if (!names.has(r.user_id)) unknown.push(r.user_id);
  const unknownKey = [...new Set(unknown)].sort().join(",");
  const { refetch } = q;
  useEffect(() => {
    if (!unknownKey) return;
    void refetch();
  }, [unknownKey, refetch]);

  return { name: (userId: string) => names.get(userId) ?? "Guest", has: (userId: string) => names.has(userId), q };
}

/** The signed-in person's own display name on this trip (null until they pick one). Same cache as usePeople. */
export function useMyName() {
  const trip = useTrip();
  const me = useUser().data?.id;
  return useQuery({
    queryKey: peopleKey(trip.id),
    queryFn: () => fetchPeople(trip.id),
    enabled: !!me,
    select: (rows) => rows.find((p) => p.user_id === me)?.label?.trim() || null,
  });
}

export function useSetMyName() {
  const trip = useTrip();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await getSupabase().rpc("set_my_label", { p_trip: trip.id, p_label: name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(trip.id) }),
    onError: (e) => toast.error(`Couldn't save your name: ${errorMessage(e)}`),
  });
}

/** Set, change or clear (value = null) the caller's vote on an idea. Optimistic; rolls back with a message. */
export function useCastVote() {
  const trip = useTrip();
  const user = useUser();
  const qc = useQueryClient();
  const key = qk.table("votes", trip.id);
  return useMutation({
    mutationFn: async ({
      idea,
      value,
      existing,
    }: {
      idea: Idea;
      value: VoteValue | null;
      existing: Vote | undefined;
    }) => {
      const db = getSupabase();
      if (!user.data) throw new Error("Not signed in");
      if (value === null) {
        if (!existing) return;
        const { error } = await db.from("votes").delete().eq("id", existing.id);
        if (error) throw error;
      } else if (existing) {
        const { error } = await db
          .from("votes")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("votes").insert({
          id: newId(),
          trip_id: trip.id,
          item_table: idea.table,
          item_id: idea.id,
          user_id: user.data.id,
          value,
        });
        if (error) throw error;
      }
    },
    onMutate: async ({ idea, value, existing }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Vote[]>(key);
      const now = new Date().toISOString();
      qc.setQueryData<Vote[]>(key, (old = []) => {
        if (value === null) return old.filter((v) => v.id !== existing?.id);
        if (existing) return old.map((v) => (v.id === existing.id ? { ...v, value, updated_at: now } : v));
        return [
          ...old,
          {
            id: `optimistic-${idea.key}`,
            trip_id: trip.id,
            item_table: idea.table,
            item_id: idea.id,
            user_id: user.data?.id ?? "",
            value,
            created_at: now,
            updated_at: now,
          },
        ];
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(`Couldn't save your vote: ${errorMessage(err)}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useAddComment() {
  const user = useUser();
  const insert = useInsertRow("comments", "comment");
  return (idea: Idea, body: string) => {
    const text = body.trim();
    if (!text || !user.data) return false;
    insert.mutate([
      { id: newId(), item_table: idea.table, item_id: idea.id, user_id: user.data.id, body: text.slice(0, 1000) },
    ]);
    return true;
  };
}

/** Owner or editor: draft / confirmed / dropped. The database also keeps tentative stops in step. */
export function useSetDecision() {
  const trip = useTrip();
  const qc = useQueryClient();
  const hotels = useUpdateRow("hotel_ideas", "idea");
  const food = useUpdateRow("food_places", "idea");
  const sights = useUpdateRow("attractions", "idea");
  return (idea: Idea, decision: Decision) => {
    const m = idea.table === "hotel_ideas" ? hotels : idea.table === "food_places" ? food : sights;
    m.mutate(
      { id: idea.id, patch: { decision } },
      {
        // The stop that points at this idea is made solid or removed by a database trigger.
        onSuccess: () => qc.invalidateQueries({ queryKey: qk.table("itinerary_items", trip.id) }),
      },
    );
    if (decision === "dropped")
      toast(`Dropped “${idea.name}”`, {
        action: { label: "Undo", onClick: () => m.mutate({ id: idea.id, patch: { decision: "draft" } }) },
      });
  };
}

/**
 * Confirm a place. A confirmed stay is also a booking, so it is added to the Stays page too (once: a stay that already
 * points at this idea is left alone). Dates come from the stay's trip days and the trip start.
 */
export function useConfirmIdea() {
  const trip = useTrip();
  const setDecision = useSetDecision();
  const updateHotel = useUpdateRow("hotel_ideas", "stay");
  return (idea: Idea) => {
    setDecision(idea, "confirmed");
    // A stay is this same idea row with its booking filled in (nothing to insert): a stay that already is one is left alone.
    const booking = bookingForConfirm(idea, trip.start_date);
    if (!booking) return;
    updateHotel.mutate({ id: idea.id, patch: booking as never });
    toast.success("Confirmed, and added to Stays.");
  };
}

/** Delete an idea for good (used for dropped ones). Everything goes through the usual delete with its Undo. */
export function useDeleteIdea() {
  const hotels = useRows("hotel_ideas");
  const food = useRows("food_places");
  const sights = useRows("attractions");
  const delHotel = useDeleteRow("hotel_ideas", "hotel idea");
  const delFood = useDeleteRow("food_places", "food place");
  const delSight = useDeleteRow("attractions", "attraction");
  return (idea: Idea) => {
    if (idea.table === "hotel_ideas") {
      const row = hotels.data?.find((r) => r.id === idea.id);
      if (row) delHotel(row, `“${idea.name}”`);
    } else if (idea.table === "food_places") {
      const row = food.data?.find((r) => r.id === idea.id);
      if (row) delFood(row, `“${idea.name}”`);
    } else {
      const row = sights.data?.find((r) => r.id === idea.id);
      if (row) delSight(row, `“${idea.name}”`);
    }
  };
}

/** Paste several: one draft per line, all at once. */
export function useAddIdeas() {
  const trip = useTrip();
  const qc = useQueryClient();
  const db = () => getSupabase();
  return useMutation({
    mutationFn: async ({
      kind,
      city,
      items,
    }: {
      kind: "stay" | "food" | "sight";
      city: string | null;
      items: ParsedIdea[];
    }) => {
      const base = { trip_id: trip.id, city };
      if (kind === "stay") {
        const { error } = await db()
          .from("hotel_ideas")
          .insert(items.map((i) => ({ ...base, id: newId(), hotel: i.name, nights: 1, total: i.price })));
        if (error) throw error;
      } else {
        const table = kind === "food" ? "food_places" : "attractions";
        const { error } = await db()
          .from(table)
          .insert(items.map((i) => ({ ...base, id: newId(), name: i.name, price: i.price, status: "Idea" })));
        if (error) throw error;
      }
      return items.length;
    },
    onSuccess: (n, v) => {
      const table = v.kind === "stay" ? "hotel_ideas" : v.kind === "food" ? "food_places" : "attractions";
      void qc.invalidateQueries({ queryKey: qk.table(table, trip.id) });
      toast.success(n === 1 ? "Added 1 draft." : `Added ${n} drafts.`);
    },
    onError: (e) => toast.error(`Couldn't add the ideas: ${errorMessage(e)}`),
  });
}

/** Owner/editor only: a dashed placeholder in the itinerary that points back at a draft. */
export function useAddTentativeStop() {
  const trip = useTrip();
  const insert = useInsertRow("itinerary_items", "stop");
  const items = useRows("itinerary_items");
  const canEdit = useCanEdit();
  return (idea: Idea, when: { day: number | null; at_time: string | null }) => {
    if (!canEdit) return;
    // The day is what is stored; the date is worked out from the trip start, and the stop goes to the end of its day.
    const place = placeAtEndOfDay(items.data ?? [], when.day, trip.start_date);
    insert.mutate([
      {
        id: newId(),
        activity: idea.name,
        city: idea.city,
        type: idea.kind === "food" ? "Food & Drink" : idea.kind === "stay" ? "Rest & Stay" : "Sightseeing",
        source_table: idea.table,
        source_id: idea.id,
        tentative: idea.decision === "draft",
        ...place,
        at_time: when.at_time,
      },
    ]);
    toast.success(idea.decision === "draft" ? "Added as a tentative stop." : "Added to the itinerary.");
  };
}
