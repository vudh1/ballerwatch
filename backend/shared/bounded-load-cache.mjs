/**
 * Small per-isolate cache for read-only derived public data (v8.5.3).
 * Bound memory, coalesce concurrent callers, never cache errors.
 * Stale snapshots may be served only for explicitly classified transient errors;
 * missing/invalid/encrypted runtime records must fail closed.
 */
export function createBoundedLoadCache({ maxEntries = 40, now = () => Date.now() } = {}) {
  const entries = new Map();
  function trim() {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  }
  return {
    async get(key, ttlMs, loader, {
      staleMs = 0,
      transientError = () => false,
    } = {}) {
      let entry = entries.get(key);
      const time = now();
      if (entry?.value !== undefined && time < entry.expiresAt) return entry.value;
      if (entry?.pending) return entry.pending;
      if (!entry) {
        entry = { value: undefined, updatedAt: 0, expiresAt: 0, pending: null };
        entries.set(key, entry);
        trim();
      }
      const current = entry;
      const pending = (async () => {
        try {
          const value = await loader();
          current.value = value;
          current.updatedAt = now();
          current.expiresAt = current.updatedAt + ttlMs;
          return value;
        } catch (error) {
          // Never treat missing or corrupt canonical state as a cached success.
          if (current.value !== undefined &&
              now() - current.updatedAt <= staleMs && transientError(error)) {
            current.expiresAt = now() + Math.min(5000, ttlMs);
            return current.value;
          }
          if (current.value === undefined) entries.delete(key);
          throw error;
        } finally {
          current.pending = null;
        }
      })();
      current.pending = pending;
      return pending;
    },
    clear(key) { entries.delete(key); },
    get size() { return entries.size; },
  };
}
