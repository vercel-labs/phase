type ROCallback = (entry: ResizeObserverEntry, replayed?: true) => void;

let observer: ResizeObserver | null = null;
let delivering: Element | undefined;
const callbacks = new Map<Element, Set<ROCallback>>();
const latestEntries = new Map<Element, ResizeObserverEntry>();

/**
 * Observe an element via a singleton ResizeObserver.
 * One RO instance for the entire page. An element may have any number of
 * subscribers; each receives every entry delivered after it subscribes. A new
 * subscriber also receives the latest entry in a queued microtask unless it
 * cleans up or receives a native entry first. The replay passes `true` as the
 * callback's second argument. Subscriber errors do not stop fan-out; the first
 * error is rethrown after every current subscriber runs.
 *
 * Per-element `box` options are forwarded to `ResizeObserver.observe()`. A
 * single RO holds one observation per target, so when subscribers disagree on
 * `box` the most recent call wins. Every entry carries all box sizes, so a
 * subscriber can still read the box it cares about; only which box change
 * triggers a notification is affected.
 *
 * @returns Cleanup function that removes this subscriber, unobserving the
 * element once none remain.
 */
export function observeResize(
  element: Element,
  callback: ROCallback,
  box?: ResizeObserverBoxOptions,
): () => void {
  let subscribers: Set<ROCallback> | undefined = callbacks.get(element);
  if (!subscribers) {
    subscribers = new Set();
    callbacks.set(element, subscribers);
  }
  const isNewSubscriber: boolean = !subscribers.has(callback);
  subscribers.add(callback);
  getObserver().observe(element, box ? { box } : undefined);

  let disposed = false;
  const latestEntry: ResizeObserverEntry | undefined =
    latestEntries.get(element);
  if (latestEntry && isNewSubscriber && delivering !== element) {
    queueMicrotask(() => {
      if (
        disposed ||
        !callbacks.get(element)?.has(callback) ||
        latestEntries.get(element) !== latestEntry
      )
        return;
      callback(latestEntry, true);
    });
  }

  return () => {
    if (disposed) return;
    disposed = true;

    const current: Set<ROCallback> | undefined = callbacks.get(element);
    if (!current) return;

    current.delete(callback);
    if (current.size > 0) return;

    callbacks.delete(element);
    latestEntries.delete(element);
    observer?.unobserve(element);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Lazy-created singleton. RO takes zero constructor options, so one instance can observe everything. */
function getObserver(): ResizeObserver {
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const subscribers: Set<ROCallback> | undefined = callbacks.get(
          entry.target,
        );
        if (!subscribers) continue;
        latestEntries.set(entry.target, entry);
        delivering = entry.target;
        let didThrow = false;
        let firstError: unknown;
        try {
          // Set identity deduplicates recursive registration without allocating
          // a snapshot on every resize notification.
          for (const cb of subscribers) {
            try {
              cb(entry);
            } catch (error) {
              if (didThrow) continue;
              didThrow = true;
              firstError = error;
            }
          }
          if (didThrow) throw firstError;
        } finally {
          delivering = undefined;
        }
      }
    });
  }
  return observer;
}
