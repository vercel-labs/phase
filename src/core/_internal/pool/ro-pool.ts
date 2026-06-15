type ROCallback = (entry: ResizeObserverEntry) => void;

let observer: ResizeObserver | null = null;
const callbacks = new Map<Element, ROCallback>();

/**
 * Observe an element via a singleton ResizeObserver.
 * One RO instance for the entire page — RO takes zero constructor options.
 *
 * @returns Cleanup function that unobserves the element.
 */
export function observeResize(
  element: Element,
  callback: ROCallback,
): () => void {
  callbacks.set(element, callback);
  getObserver().observe(element);

  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    // Only unobserve if our callback is still the registered one.
    // A later subscription on the same element would have overwritten it.
    if (callbacks.get(element) === callback) {
      callbacks.delete(element);
      observer?.unobserve(element);
    }
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Lazy-created singleton — RO takes zero constructor options, so one instance can observe everything. */
function getObserver(): ResizeObserver {
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cb: ROCallback | undefined = callbacks.get(entry.target);
        if (cb) cb(entry);
      }
    });
  }
  return observer;
}
