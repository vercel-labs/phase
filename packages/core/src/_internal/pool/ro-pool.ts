/** Whether an entry came from ResizeObserver or the pool's cache. */
export type ResizeDeliverySource = 'native' | 'replay';

type ROCallback = (
  entry: ResizeObserverEntry,
  source: ResizeDeliverySource,
) => void;
type ROSubscribers = Map<ROCallback, number>;

let observer: ResizeObserver | null = null;
let delivery = 0;
const callbacks = new Map<Element, ROSubscribers>();
const latestEntries = new Map<Element, ResizeObserverEntry>();

/**
 * Observe an element via a singleton ResizeObserver.
 * One RO instance for the entire page. An element may have any number of
 * subscribers; each receives every entry delivered after it subscribes. A new
 * subscriber also receives the latest entry in a queued microtask unless it
 * cleans up or receives a native entry first. The callback's second argument
 * identifies native and replayed entries.
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
  let subscribers: ROSubscribers | undefined = callbacks.get(element);
  if (!subscribers) {
    subscribers = new Map();
    callbacks.set(element, subscribers);
  }
  const isNewSubscriber: boolean = !subscribers.has(callback);
  if (isNewSubscriber) subscribers.set(callback, delivery);
  getObserver().observe(element, box ? { box } : undefined);

  let disposed = false;
  const latestEntry: ResizeObserverEntry | undefined =
    latestEntries.get(element);
  if (latestEntry && isNewSubscriber) {
    // Keep replay non-reentrant and let cleanup cancel it before delivery.
    queueMicrotask(() => {
      if (
        disposed ||
        !callbacks.get(element)?.has(callback) ||
        latestEntries.get(element) !== latestEntry
      )
        return;
      callback(latestEntry, 'replay');
    });
  }

  return () => {
    if (disposed) return;
    disposed = true;

    const current: ROSubscribers | undefined = callbacks.get(element);
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
        const subscribers: ROSubscribers | undefined = callbacks.get(
          entry.target,
        );
        if (subscribers) dispatchEntry(entry, subscribers);
      }
    });
  }
  return observer;
}

/** Cache and deliver one native entry without consuming subscribers added during delivery. */
function dispatchEntry(
  entry: ResizeObserverEntry,
  subscribers: ROSubscribers,
): void {
  const currentDelivery: number = ++delivery;
  latestEntries.set(entry.target, entry);
  for (const [callback, joinedDelivery] of subscribers) {
    if (joinedDelivery < currentDelivery) callback(entry, 'native');
  }
}
