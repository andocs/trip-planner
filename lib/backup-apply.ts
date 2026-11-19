import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { tripIsEmpty } from "@/lib/seed-apply";
import { BACKUP_TABLES, BackupError, type Backup } from "@/lib/backup";

type Client = SupabaseClient<Database>;
const CHUNK = 500;

/**
 * Restores a backup into an EMPTY trip. supabase-js can't wrap several requests in one transaction, so on any failure
 * the rows inserted so far are deleted again (in reverse order) and the error is re-thrown: the trip is never left
 * half-restored. The new trip's default categories are replaced by the backup's own (expenses point at those ids).
 * Row-level security still decides who may write: a viewer's inserts are refused by the database.
 */
export async function applyBackup(client: Client, tripId: string, backup: Backup): Promise<{ rows: number }> {
  const db = client as unknown as SupabaseClient;
  if (!(await tripIsEmpty(client, tripId))) {
    throw new BackupError("This trip already has data. A backup only restores into an empty trip: start a new trip first.");
  }
  const { data: defaults, error: dErr } = await db.from("categories").select("id").eq("trip_id", tripId);
  if (dErr) throw dErr;

  const inserted: { table: string; ids: string[] }[] = [];
  let rows = 0;
  try {
    for (const table of BACKUP_TABLES) {
      const list = backup.tables[table];
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        const { error } = await db.from(table).insert(part.map((r) => ({ ...r, trip_id: tripId })));
        if (error) throw new Error(`${table}: ${error.message}`);
        inserted.push({ table, ids: part.map((r) => r.id as string) });
        rows += part.length;
      }
    }
    if (Object.keys(backup.trip).length > 0) {
      const { error } = await db.from("trips").update(backup.trip).eq("id", tripId);
      if (error) throw new Error(`trip settings: ${error.message}`);
    }
  } catch (err) {
    for (const { table, ids } of inserted.reverse()) await db.from(table).delete().in("id", ids).eq("trip_id", tripId);
    if (err instanceof Error && /duplicate key/i.test(err.message))
      throw new BackupError("Some of these items already exist in another trip. A backup can only be restored once the original trip is gone.");
    throw err;
  }

  // The backup's categories are in; the empty trip's defaults (nothing points at them) are no longer needed.
  const keep = new Set(backup.tables.categories.map((c) => c.id as string));
  const stale = (defaults ?? []).map((c: { id: string }) => c.id).filter((id: string) => !keep.has(id));
  if (stale.length > 0 && backup.tables.categories.length > 0) await db.from("categories").delete().in("id", stale).eq("trip_id", tripId);
  return { rows };
}
