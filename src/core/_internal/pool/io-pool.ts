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
const rootIds = new WeakMap<object, number>();
let nextRootId = 1;

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

  let elementCallbacks: Set<IOCallback> | undefined =
    entry.callbacks.get(element);
  if (!elementCallbacks) {
    elementCallbacks = new Set();
    entry.callbacks.set(element, elementCallbacks);
    entry.observer.observe(element);
  }
  elementCallbacks.add(onIntersect);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: IOPoolEntry | undefined = pool.get(key);
    if (!poolEntry) return;

    const callbacks: Set<IOCallback> | undefined =
      poolEntry.callbacks.get(element);
    if (callbacks) {
      callbacks.delete(onIntersect);
    }
    if (callbacks?.size === 0) {
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
  const root = getRootKey(opts.root);
  const margin = opts.rootMargin ?? '0px';
  const threshold = Array.isArray(opts.threshold)
    ? [...new Set(opts.threshold)].toSorted((a, b) => a - b).join(',')
    : String(opts.threshold ?? 0);

  return `${root}|${margin}|${threshold}`;
}

function getRootKey(root: Element | Document | null | undefined): string {
  if (!root) return 'null';
  let id: number | undefined = rootIds.get(root);
  if (id === undefined) {
    id = nextRootId++;
    rootIds.set(root, id);
  }
  return String(id);
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
      const elementCallbacks: Set<IOCallback> | undefined = callbacks.get(
        ioEntry.target,
      );
      if (!elementCallbacks) continue;

      let firstError: unknown;
      let hasError = false;
      const currentCallbacks = Array.from(elementCallbacks);
      for (const callback of currentCallbacks) {
        if (!elementCallbacks.has(callback)) continue;
        try {
          callback(ioEntry);
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
      if (hasError) throw firstError;
    }
  }, options);

  return { observer, callbacks };
};
