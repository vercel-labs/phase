type IOCallback = (entry: IntersectionObserverEntry) => void;

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
  element: Element,
  callback: IOCallback,
  options?: IntersectionObserverInit,
): () => void {
  const key: string = getPoolKey(options);
  const entry: IOPoolEntry = getOrCreateEntry(key, options);

  entry.callbacks.set(element, callback);
  entry.observer.observe(element);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: IOPoolEntry | undefined = pool.get(key);
    if (!poolEntry) return;

    // Only unobserve if our callback is still the registered one.
    // A later subscription on the same element would have overwritten it.
    if (poolEntry.callbacks.get(element) === callback) {
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
 * IntersectionObserver options are immutable after construction, so observers
 * with identical options can be shared. This produces a stable string key
 * from `{ root, rootMargin, threshold }` to group them in the pool.
 */
function getPoolKey(opts?: IntersectionObserverInit): string {
  if (!opts) return '';

  const root = opts.root ? 'custom' : 'null';
  const margin = opts.rootMargin ?? '0px';
  const threshold = Array.isArray(opts.threshold)
    ? opts.threshold.join(',')
    : String(opts.threshold ?? 0);

  return `${root}|${margin}|${threshold}`;
}

/** Return an existing pool entry for this key, or create and register a new one. */
function getOrCreateEntry(
  key: string,
  options?: IntersectionObserverInit,
): IOPoolEntry {
  const existing: IOPoolEntry | undefined = pool.get(key);
  if (existing) return existing;

  const callbacks = new Map<Element, IOCallback>();
  const observer = new IntersectionObserver((entries) => {
    for (const ioEntry of entries) {
      const cb: IOCallback | undefined = callbacks.get(ioEntry.target);
      if (cb) cb(ioEntry);
    }
  }, options);

  const entry: IOPoolEntry = { observer, callbacks };
  pool.set(key, entry);

  return entry;
}
