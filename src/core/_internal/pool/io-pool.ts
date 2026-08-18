type IOCallback = (entry: IntersectionObserverEntry) => void;

export interface ObserveIntersectionOptions {
  element: Element;
  onIntersect: IOCallback;
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
}

interface IOPoolEntry {
  observer: IntersectionObserver;
  callbacks: Map<Element, Set<IOCallback>>;
}

const pool = new Map<string, IOPoolEntry>();

/**
 * Observe an element via a shared IntersectionObserver pool.
 * Elements with identical options share one IO instance. An element may have
 * any number of subscribers; each receives every entry, and the element stays
 * observed until the last one cleans up.
 *
 * @returns Cleanup function that removes this subscriber, unobserving the
 * element once none remain and dropping the IO once it observes nothing.
 */
export function observeIntersection(
  options: ObserveIntersectionOptions,
): () => void {
  const { element, onIntersect, root, rootMargin, threshold } = options;
  const ioInit: IntersectionObserverInit = { root, rootMargin, threshold };

  const key: string = getPoolKey(ioInit);
  const entry: IOPoolEntry = getOrCreatePoolEntry(key, ioInit);

  let subscribers: Set<IOCallback> | undefined = entry.callbacks.get(element);
  if (!subscribers) {
    subscribers = new Set();
    entry.callbacks.set(element, subscribers);
  }
  subscribers.add(onIntersect);
  entry.observer.observe(element);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: IOPoolEntry | undefined = pool.get(key);
    if (!poolEntry) return;

    // Unobserve once this element has no subscribers left; other subscribers
    // on the same element must keep receiving entries.
    const current: Set<IOCallback> | undefined =
      poolEntry.callbacks.get(element);
    if (current) {
      current.delete(onIntersect);
      if (current.size === 0) {
        poolEntry.observer.unobserve(element);
        poolEntry.callbacks.delete(element);
      }
    }

    if (poolEntry.callbacks.size === 0) {
      poolEntry.observer.disconnect();
      pool.delete(key);
    }
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Produces a stable string key from IO options to group observers in the pool.
 * IO options are immutable after construction, so identical options can share.
 */
function getPoolKey(opts: IntersectionObserverInit): string {
  const root = opts.root ? 'custom' : 'null';
  const margin = opts.rootMargin ?? '0px';
  const threshold = Array.isArray(opts.threshold)
    ? opts.threshold.join(',')
    : String(opts.threshold ?? 0);

  return `${root}|${margin}|${threshold}`;
}

/** Return an existing pool entry for this key, or create and register a new one. */
function getOrCreatePoolEntry(
  key: string,
  options: IntersectionObserverInit,
): IOPoolEntry {
  const existing: IOPoolEntry | undefined = pool.get(key);
  if (existing) return existing;

  const entry = createPoolEntry(options);

  pool.set(key, entry);
  return entry;
}

/** Create a new pool entry for the given options. */
const createPoolEntry = (options: IntersectionObserverInit): IOPoolEntry => {
  const callbacks = new Map<Element, Set<IOCallback>>();
  const observer = new IntersectionObserver((entries) => {
    for (const ioEntry of entries) {
      const subscribers: Set<IOCallback> | undefined = callbacks.get(
        ioEntry.target,
      );
      if (!subscribers) continue;
      // Iterated directly rather than copied: Set iteration already tolerates
      // a subscriber removing itself, which is the reentrant case that happens.
      for (const cb of subscribers) cb(ioEntry);
    }
  }, options);

  return { observer, callbacks };
};
