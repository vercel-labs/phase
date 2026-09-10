type MQLCallback = (matches: boolean) => void;

interface MQLPoolEntry {
  mql: MediaQueryList;
  listeners: Set<MQLCallback>;
  handler: (e: MediaQueryListEvent) => void;
}

const pool = new Map<string, MQLPoolEntry>();

/**
 * Subscribe to a media query via a shared MediaQueryList pool.
 * Multiple subscribers to the same query share one MQL and one change listener.
 *
 * @returns Cleanup function that removes the subscriber.
 */
export function subscribeMediaQuery(
  query: string,
  callback: MQLCallback,
): () => void {
  const entry: MQLPoolEntry = getOrCreateEntry(query);

  entry.listeners.add(callback);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: MQLPoolEntry | undefined = pool.get(query);
    if (!poolEntry) return;
    poolEntry.listeners.delete(callback);

    if (poolEntry.listeners.size === 0) {
      poolEntry.mql.removeEventListener('change', poolEntry.handler);
      pool.delete(query);
    }
  };
}

/**
 * Synchronous read of a media query via the shared pool.
 * Uses the existing pool entry if available, otherwise reads directly.
 */
export function readMediaQuery(query: string): boolean {
  const entry: MQLPoolEntry | undefined = pool.get(query);
  if (entry) return entry.mql.matches;
  return matchMedia(query).matches;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return an existing pool entry for this query, or create and register a new one. */
function getOrCreateEntry(query: string): MQLPoolEntry {
  const existing: MQLPoolEntry | undefined = pool.get(query);
  if (existing) return existing;

  const entry = createPoolEntry(query);

  entry.mql.addEventListener('change', entry.handler);
  pool.set(query, entry);

  return entry;
}

const createPoolEntry = (query: string): MQLPoolEntry => {
  const mql: MediaQueryList = matchMedia(query);
  const listeners = new Set<MQLCallback>();

  const handler = (event: MediaQueryListEvent): void => {
    for (const cb of listeners) cb(event.matches);
  };
  return { mql, listeners, handler };
};
