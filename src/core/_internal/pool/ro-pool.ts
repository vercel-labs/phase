type ROCallback = (entry: ResizeObserverEntry) => void;

interface ROSubscription {
  readonly callback: ROCallback;
}

interface ROPoolEntry {
  readonly observer: ResizeObserver;
  readonly targets: Map<Element, Set<ROSubscription>>;
}

const pool = new Map<ResizeObserverBoxOptions, ROPoolEntry>();

/**
 * Observe an element through the observer for its requested box type.
 * Multiple subscriptions on the same element coexist and clean up independently.
 */
export function observeResize(
  element: Element,
  callback: ROCallback,
  box: ResizeObserverBoxOptions = 'content-box',
): () => void {
  const entry: ROPoolEntry = getPoolEntry(box);
  let subscriptions: Set<ROSubscription> | undefined =
    entry.targets.get(element);

  if (!subscriptions) {
    subscriptions = new Set();
    entry.targets.set(element, subscriptions);
    entry.observer.observe(element, { box });
  }

  const subscription: ROSubscription = { callback };
  subscriptions.add(subscription);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;

    const current: Set<ROSubscription> | undefined = entry.targets.get(element);
    if (!current) return;

    current.delete(subscription);
    if (current.size > 0) return;

    entry.targets.delete(element);
    entry.observer.unobserve(element);
    if (entry.targets.size === 0) {
      entry.observer.disconnect();
      pool.delete(box);
    }
  };
}

function getPoolEntry(box: ResizeObserverBoxOptions): ROPoolEntry {
  const existing: ROPoolEntry | undefined = pool.get(box);
  if (existing) return existing;

  const targets = new Map<Element, Set<ROSubscription>>();
  const observer = new ResizeObserver((entries) => {
    let firstError: unknown;
    let hasError = false;

    for (const resizeEntry of entries) {
      const subscriptions: Set<ROSubscription> | undefined = targets.get(
        resizeEntry.target,
      );
      if (!subscriptions) continue;

      const current = Array.from(subscriptions);
      for (const subscription of current) {
        if (!subscriptions.has(subscription)) continue;
        try {
          subscription.callback(resizeEntry);
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
    }

    if (hasError) throw firstError;
  });

  const entry: ROPoolEntry = { observer, targets };
  pool.set(box, entry);
  return entry;
}
