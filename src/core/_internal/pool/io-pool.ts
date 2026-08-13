type IOCallback = (entry: IntersectionObserverEntry) => void;

interface IOSubscription {
  readonly callback: IOCallback;
}

interface IOPoolEntry {
  readonly observer: IntersectionObserver;
  readonly targets: Map<Element, Set<IOSubscription>>;
}

interface NormalizedIntersectionOptions extends IntersectionObserverInit {
  threshold: number[];
}

const viewportPool = new Map<string, IOPoolEntry>();
const rootedPools = new WeakMap<Element | Document, Map<string, IOPoolEntry>>();

export interface ObserveIntersectionOptions extends IntersectionObserverInit {
  element: Element;
  onIntersect: IOCallback;
}

/**
 * Observe an element through an IO shared by root identity and normalized
 * options. Same-element subscriptions coexist and clean up independently.
 */
export function observeIntersection(
  options: ObserveIntersectionOptions,
): () => void {
  const { element, onIntersect, ...ioOptions } = options;
  const normalized: NormalizedIntersectionOptions = normalizeOptions(ioOptions);
  const bucket: Map<string, IOPoolEntry> = getBucket(normalized.root);
  const key: string = getPoolKey(normalized);
  let entry: IOPoolEntry | undefined = bucket.get(key);

  if (!entry) {
    entry = createPoolEntry(normalized);
    bucket.set(key, entry);
  }

  let subscriptions: Set<IOSubscription> | undefined =
    entry.targets.get(element);
  if (!subscriptions) {
    subscriptions = new Set();
    entry.targets.set(element, subscriptions);
    entry.observer.observe(element);
  }

  const subscription: IOSubscription = { callback: onIntersect };
  subscriptions.add(subscription);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;

    const poolEntry: IOPoolEntry | undefined = bucket.get(key);
    const current: Set<IOSubscription> | undefined =
      poolEntry?.targets.get(element);
    if (!poolEntry || !current) return;

    current.delete(subscription);
    if (current.size > 0) return;

    poolEntry.observer.unobserve(element);
    poolEntry.targets.delete(element);
    if (poolEntry.targets.size === 0) {
      poolEntry.observer.disconnect();
      bucket.delete(key);
    }
  };
}

function getBucket(
  root: Element | Document | null | undefined,
): Map<string, IOPoolEntry> {
  if (!root) return viewportPool;

  let bucket: Map<string, IOPoolEntry> | undefined = rootedPools.get(root);
  if (!bucket) {
    bucket = new Map();
    rootedPools.set(root, bucket);
  }
  return bucket;
}

function normalizeOptions(
  options: IntersectionObserverInit,
): NormalizedIntersectionOptions {
  const input: number[] = Array.isArray(options.threshold)
    ? options.threshold
    : [options.threshold ?? 0];
  const threshold: number[] =
    input.length === 0
      ? [0]
      : [...new Set(input)].toSorted((first, second) => first - second);

  return { ...options, threshold };
}

function getPoolKey(options: NormalizedIntersectionOptions): string {
  return `${options.rootMargin ?? '0px'}|${options.scrollMargin ?? '0px'}|${options.threshold.join(',')}`;
}

function createPoolEntry(options: NormalizedIntersectionOptions): IOPoolEntry {
  const targets = new Map<Element, Set<IOSubscription>>();
  const observer = new IntersectionObserver((entries) => {
    let firstError: unknown;
    let hasError = false;

    for (const ioEntry of entries) {
      const subscriptions: Set<IOSubscription> | undefined = targets.get(
        ioEntry.target,
      );
      if (!subscriptions) continue;

      const current = Array.from(subscriptions);
      for (const subscription of current) {
        if (!subscriptions.has(subscription)) continue;
        try {
          subscription.callback(ioEntry);
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
    }

    if (hasError) throw firstError;
  }, options);

  return { observer, targets };
}
