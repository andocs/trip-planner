/**
 * A small in-memory limiter: at most `perMinute` calls per key in any minute. Per server instance (the same trade-off as the
 * other API routes: it stops a runaway page, it is not a defence against a determined attacker), and old keys are dropped
 * so the map cannot grow without bound. `now` is a parameter so it is testable.
 */
export function createLimiter(perMinute: number, maxKeys = 500) {
  const calls = new Map<string, number[]>();
  return (key: string, now: number = Date.now()): boolean => {
    if (calls.size > maxKeys) for (const [k, v] of calls) if (v.every((t) => now - t >= 60_000)) calls.delete(k);
    const recent = (calls.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      calls.set(key, recent);
      return false;
    }
    calls.set(key, [...recent, now]);
    return true;
  };
}

/** A tiny cache with an expiry and a size cap (oldest out first). */
export function createCache<V>(ttlMs: number, max = 200) {
  const items = new Map<string, { at: number; value: V }>();
  return {
    get(key: string, now: number = Date.now()): V | undefined {
      const hit = items.get(key);
      if (!hit) return undefined;
      if (now - hit.at > ttlMs) {
        items.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V, now: number = Date.now()) {
      items.delete(key);
      items.set(key, { at: now, value });
      while (items.size > max) items.delete(items.keys().next().value as string);
    },
    get size() {
      return items.size;
    },
  };
}
