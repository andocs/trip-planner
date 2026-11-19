/**
 * A tiny IndexedDB key-value store (browser only), enough for one saved copy of the trip's data.
 * IndexedDB, not localStorage: the copy can be a few megabytes and localStorage blocks the page while it is written.
 * Every call resolves quietly when IndexedDB is missing or blocked (a private window): offline mode then simply
 * does not remember anything, and the app behaves exactly as it did before.
 */
const DB = "trip-planner-offline";
const STORE = "kv";

/** An upgrade can be held up for a moment by a connection in another tab; give up after this long. */
const BLOCKED_PATIENCE_MS = 5000;

function openAt(version?: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return db?.close(); // answered "no" already (waited too long): do not leak a late connection
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), BLOCKED_PATIENCE_MS);
    try {
      const req = version === undefined ? indexedDB.open(DB) : indexedDB.open(DB, version);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        // Let another caller upgrade the database: a connection that stays open would block it.
        req.result.onversionchange = () => req.result.close();
        finish(req.result);
      };
      req.onerror = () => finish(null);
      // onblocked: another connection is holding an upgrade up. Not an answer yet: the request goes on waiting for it.
    } catch {
      finish(null);
    }
  });
}

/**
 * Opens the database, creating the store if it is missing. A database that exists WITHOUT the store (anything that opened
 * it before this code did, or an interrupted first run) is repaired by upgrading it one version: opening it again at the
 * same version would never run the upgrade, and every later save would fail silently.
 */
async function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  // No version: opens whatever is there (a repaired database may be at version 2 or more), or creates version 1.
  const db = await openAt();
  if (!db) return null;
  if (db.objectStoreNames.contains(STORE)) return db;
  const next = db.version + 1;
  db.close();
  const repaired = await openAt(next);
  return repaired && repaired.objectStoreNames.contains(STORE) ? repaired : null;
}

type Outcome<T> = { done: true; value: T | undefined } | { done: false };

async function attempt<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<Outcome<T>> {
  const db = await open();
  if (!db) return { done: true, value: undefined };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      req.onsuccess = () => resolve({ done: true, value: req.result });
      req.onerror = () => resolve({ done: true, value: undefined });
      tx.oncomplete = () => db.close();
      tx.onabort = () => resolve({ done: true, value: undefined });
    } catch {
      // The connection was closed under us (another caller upgraded the database): the caller tries once more.
      resolve({ done: false });
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const first = await attempt(mode, work);
  if (first.done) return first.value;
  const second = await attempt(mode, work);
  return second.done ? second.value : undefined;
}

export const kvGet = <T>(key: string) => run<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
export const kvSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key)).then(() => undefined);
export const kvDelete = (key: string) => run("readwrite", (s) => s.delete(key)).then(() => undefined);
