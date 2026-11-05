"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk, type TableName } from "./keys";

/** Every table except trips/trip_members has id + trip_id and is edited the same way. */
export type ChildTable = Exclude<TableName, "trips" | "trip_members">;
export type Row<T extends ChildTable> = Tables<T>;
export type NewRow<T extends ChildTable> = Omit<TablesInsert<T>, "trip_id">;
export type Patch<T extends ChildTable> = TablesUpdate<T>;

/**
 * supabase-js can't type `.from(table)` when `table` is a generic union, so this module
 * talks to an untyped client internally and exposes typed rows through Tables<T>.
 */
const db = () => getSupabase() as unknown as SupabaseClient;

const UNDO_MS = 6000;

export function useRows<T extends ChildTable>(table: T, sort?: (a: Row<T>, b: Row<T>) => number) {
  const trip = useTrip();
  return useQuery({
    queryKey: qk.table(table, trip.id),
    queryFn: async (): Promise<Row<T>[]> => {
      const { data, error } = await db().from(table).select("*").eq("trip_id", trip.id).order("created_at");
      if (error) throw error;
      return data as Row<T>[];
    },
    select: sort ? (rows) => [...rows].sort(sort) : undefined,
  });
}

type Snapshot<T extends ChildTable> = { key: readonly unknown[]; prev: Row<T>[] | undefined };

async function snapshot<T extends ChildTable>(qc: QueryClient, key: readonly unknown[]): Promise<Snapshot<T>> {
  await qc.cancelQueries({ queryKey: key });
  return { key, prev: qc.getQueryData<Row<T>[]>(key) };
}

function rollback<T extends ChildTable>(qc: QueryClient, snap: Snapshot<T> | undefined, what: string, err: unknown) {
  if (snap) qc.setQueryData(snap.key, snap.prev);
  toast.error(`Couldn't ${what}: ${errorMessage(err)}`);
}

/** Inserts with a client-made id, so the optimistic row and the saved row are the same row. */
export function useInsertRow<T extends ChildTable>(table: T, label = "item") {
  const trip = useTrip();
  const qc = useQueryClient();
  const key = qk.table(table, trip.id);
  return useMutation({
    mutationFn: async (rows: (NewRow<T> & { id: string })[]) => {
      const { error } = await db()
        .from(table)
        .insert(rows.map((r) => ({ ...r, trip_id: trip.id })));
      if (error) throw error;
    },
    onMutate: async (rows) => {
      const snap = await snapshot<T>(qc, key);
      const now = new Date().toISOString();
      const optimistic = rows.map((r) => ({ created_at: now, ...r, trip_id: trip.id }) as unknown as Row<T>);
      qc.setQueryData<Row<T>[]>(key, (old) => [...(old ?? []), ...optimistic]);
      return snap;
    },
    onError: (err, _rows, snap) => rollback(qc, snap, `add the ${label}`, err),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateRow<T extends ChildTable>(table: T, label = "item") {
  const trip = useTrip();
  const qc = useQueryClient();
  const key = qk.table(table, trip.id);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Patch<T> }) => {
      const { error } = await db().from(table).update(patch).eq("id", id).eq("trip_id", trip.id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      const snap = await snapshot<T>(qc, key);
      qc.setQueryData<Row<T>[]>(key, (old) => old?.map((r) => (r.id === id ? ({ ...r, ...patch } as Row<T>) : r)));
      return snap;
    },
    onError: (err, _v, snap) => rollback(qc, snap, `save the ${label}`, err),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Delete with Undo. The row disappears at once, but the server delete only runs after
 * the 6-second Undo window, so Undo restores everything, including links from other rows
 * (e.g. expenses keep their category). Pending deletes are flushed if the tab is hidden.
 */
export function useDeleteRow<T extends ChildTable>(table: T, label = "item") {
  const trip = useTrip();
  const qc = useQueryClient();
  const key = qk.table(table, trip.id);

  return (row: Row<T>, description?: string) => {
    const prev = qc.getQueryData<Row<T>[]>(key);
    void qc.cancelQueries({ queryKey: key });
    qc.setQueryData<Row<T>[]>(key, (old) => old?.filter((r) => r.id !== row.id));

    const commit = async () => {
      const { error } = await db().from(table).delete().eq("id", row.id).eq("trip_id", trip.id);
      if (error) {
        qc.setQueryData<Row<T>[]>(key, (old) => (old?.some((r) => r.id === row.id) ? old : [...(old ?? []), row]));
        toast.error(`Couldn't delete the ${label}: ${errorMessage(error)}`);
      }
      void qc.invalidateQueries({ queryKey: key });
    };

    const cancel = schedule(commit, UNDO_MS);
    toast(`Deleted ${description ?? `the ${label}`}`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (cancel()) qc.setQueryData(key, prev);
        },
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Pending-delete queue, flushed when the page is hidden so deletes aren't lost.
// ---------------------------------------------------------------------------

const pending = new Map<number, () => Promise<void>>();
let nextId = 0;
let listening = false;

function flushAll() {
  for (const [id, run] of pending) {
    pending.delete(id);
    void run();
  }
}

/** Runs `fn` after `ms`. Returns a cancel function that reports whether it cancelled in time. */
function schedule(fn: () => Promise<void>, ms: number): () => boolean {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushAll());
    window.addEventListener("pagehide", flushAll);
  }
  const id = nextId++;
  pending.set(id, fn);
  const timer = setTimeout(() => {
    if (pending.delete(id)) void fn();
  }, ms);
  return () => {
    clearTimeout(timer);
    return pending.delete(id);
  };
}

export const newId = () => crypto.randomUUID();
