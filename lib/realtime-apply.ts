/**
 * How a Realtime change event updates a cached list of rows. Pure, so it's unit-tested.
 *
 * - INSERT / UPDATE: upsert by id (an echo of our own optimistic insert is a no-op).
 * - DELETE: remove by id. With RLS on, Supabase can't filter DELETE events by trip and
 *   sends only the primary key, so an id we don't have is simply ignored.
 * - Rows the user deleted but can still Undo are never resurrected by a late UPDATE.
 */
export type Change<R extends { id: string }> =
  { eventType: "INSERT" | "UPDATE"; new: R } | { eventType: "DELETE"; old: Partial<R> };

export function applyChange<R extends { id: string; trip_id?: string }>(
  rows: R[] | undefined,
  change: Change<R>,
  opts: { tripId: string; pendingDeletes?: ReadonlySet<string> },
): R[] | undefined {
  if (!rows) return rows; // nothing cached yet: the next fetch will be fresh anyway

  if (change.eventType === "DELETE") {
    const id = change.old.id;
    if (!id || !rows.some((r) => r.id === id)) return rows;
    return rows.filter((r) => r.id !== id);
  }

  const row = change.new;
  if (row.trip_id !== undefined && row.trip_id !== opts.tripId) return rows;
  if (opts.pendingDeletes?.has(row.id)) return rows;

  const i = rows.findIndex((r) => r.id === row.id);
  if (i === -1) return [...rows, row];
  const next = rows.slice();
  next[i] = { ...rows[i], ...row };
  return next;
}
