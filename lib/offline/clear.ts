import { blockPersistence } from "./persist";
import { kvDelete } from "./store";

/** localStorage keys the offline mode keeps (what time the data was last saved, when the pages were last warmed). */
export const SYNCED_KEY = "tp-offline-synced";
export const WARMED_KEY = "tp-offline-warmed";

/**
 * Removes everything the offline mode keeps on this device: the saved copy of the data, the saved pages and files, and
 * its two timestamps. Called when someone signs out, so the next person on a shared phone finds nothing of the last one.
 * Also stops any further saving for the rest of this page, or the data still in memory would be written straight back.
 * Never throws: signing out must always work.
 */
export async function clearOfflineData(): Promise<void> {
  blockPersistence();
  // Tell the service worker first: it stops any warm-up that is still running, so nothing is written back after this.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
  } catch {}
  try {
    await kvDelete("query-cache");
  } catch {}
  try {
    localStorage.removeItem(SYNCED_KEY);
    localStorage.removeItem(WARMED_KEY);
  } catch {}
  try {
    if (typeof caches !== "undefined") for (const name of await caches.keys()) if (name.startsWith("tp-")) await caches.delete(name);
  } catch {}
}
