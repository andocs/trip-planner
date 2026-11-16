/**
 * npm run photos:orphans [-- --delete]
 *
 * Finds files in the private `trip-photos` bucket that no photo row points at (left behind when an idea or a trip was
 * deleted, or an upload was interrupted). Prints counts and sizes only. With --delete it removes them through the Storage
 * API (the only supported way to free the space). Uses the service-role key from .env.local, locally only.
 * Never put SUPABASE_SERVICE_ROLE_KEY on Vercel.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}
const del = process.argv.includes("--delete");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: rows, error } = await db.from("item_images").select("storage_path").not("storage_path", "is", null);
  if (error) throw error;
  const known = new Set((rows ?? []).map((r) => r.storage_path as string));

  const files: { path: string; size: number }[] = [];
  const { data: folders, error: fe } = await db.storage.from("trip-photos").list("", { limit: 1000 });
  if (fe) throw fe;
  for (const f of folders ?? []) {
    // top level entries are trip folders (no id/metadata); list each one
    const { data: inner } = await db.storage.from("trip-photos").list(f.name, { limit: 1000 });
    for (const o of inner ?? [])
      files.push({ path: `${f.name}/${o.name}`, size: Number((o.metadata as { size?: number } | null)?.size ?? 0) });
  }
  const orphans = files.filter((f) => !known.has(f.path));
  const bytes = orphans.reduce((a, f) => a + f.size, 0);
  console.log(`Files in the bucket: ${files.length}. Photos in the database: ${known.size}.`);
  console.log(`Orphans: ${orphans.length} (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
  if (!orphans.length) return;
  if (!del) return console.log("Run again with --delete to remove them.");
  for (let i = 0; i < orphans.length; i += 100) {
    const { error: re } = await db.storage.from("trip-photos").remove(orphans.slice(i, i + 100).map((o) => o.path));
    if (re) throw re;
  }
  console.log("Removed.");
}

main().catch(() => {
  console.error("Failed (details withheld). Check the URL and key.");
  process.exit(1);
});
