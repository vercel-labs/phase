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
  callbacks: Map<Element, IOCallback>;
}

const pool = new Map<string, IOPoolEntry>();

/**
 * Observe an element via a shared IntersectionObserver pool.
 * Elements with identical options share one IO instance.
 *
 * @returns Cleanup function that unobserves the element and removes the IO if empty.
 */
export function observeIntersection(
  options: ObserveIntersectionOptions,
): () => void {
  const { element, onIntersect, root, rootMargin, threshold } = options;
  const ioInit: IntersectionObserverInit = { root, rootMargin, threshold };

  const key: string = getPoolKey(ioInit);
  const entry: IOPoolEntry = getOrCreatePoolEntry(key, ioInit);

  entry.callbacks.set(element, onIntersect);
  entry.observer.observe(element);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: IOPoolEntry | undefined = pool.get(key);
    if (!poolEntry) return;

    // Only unobserve if our callback is still the registered one.
    // A later subscription on the same element would have overwritten it.
    if (poolEntry.callbacks.get(element) === onIntersect) {
      poolEntry.observer.unobserve(element);
      poolEntry.callbacks.delete(element);
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

  return root + '|' + margin + '|' + threshold;
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
  const callbacks = new Map<Element, IOCallback>();
  const observer = new IntersectionObserver((entries) => {
    for (const ioEntry of entries) {
      const cb: IOCallback | undefined = callbacks.get(ioEntry.target);
      if (cb) cb(ioEntry);
    }
  }, options);

  return { observer, callbacks };
};
