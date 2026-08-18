type ROCallback = (entry: ResizeObserverEntry) => void;

let observer: ResizeObserver | null = null;
const callbacks = new Map<Element, Set<ROCallback>>();

/**
 * Observe an element via a singleton ResizeObserver.
 * One RO instance for the entire page. An element may have any number of
 * subscribers; each receives every entry, and the element stays observed
 * until the last one cleans up.
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
  subscribers.add(callback);
  getObserver().observe(element, box ? { box } : undefined);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    const current: Set<ROCallback> | undefined = callbacks.get(element);
    if (!current) return;

    current.delete(callback);
    if (current.size > 0) return;

    callbacks.delete(element);
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
        // Iterated directly rather than copied: this runs on every resize
        // notification, and Set iteration already tolerates a subscriber
        // removing itself, which is the reentrant case that actually happens.
        for (const cb of subscribers) cb(entry);
      }
    });
  }
  return observer;
}
