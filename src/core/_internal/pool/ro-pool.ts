type ROCallback = (entry: ResizeObserverEntry) => void;

interface ROPoolEntry {
  observer: ResizeObserver;
  callbacks: Map<Element, Set<ROCallback>>;
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
  let elementCallbacks: Set<ROCallback> | undefined =
    entry.callbacks.get(element);

  if (!elementCallbacks) {
    elementCallbacks = new Set();
    entry.callbacks.set(element, elementCallbacks);
    entry.observer.observe(element, { box });
  }
  elementCallbacks.add(callback);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;

    const callbacks: Set<ROCallback> | undefined = entry.callbacks.get(element);
    if (!callbacks) return;
    callbacks.delete(callback);
    if (callbacks.size > 0) return;

    entry.callbacks.delete(element);
    entry.observer.unobserve(element);
  };
}

function getPoolEntry(box: ResizeObserverBoxOptions): ROPoolEntry {
  const existing: ROPoolEntry | undefined = pool.get(box);
  if (existing) return existing;

  const callbacks = new Map<Element, Set<ROCallback>>();
  const observer = new ResizeObserver((entries) => {
    for (const resizeEntry of entries) {
      const elementCallbacks: Set<ROCallback> | undefined = callbacks.get(
        resizeEntry.target,
      );
      if (!elementCallbacks) continue;

      let firstError: unknown;
      let hasError = false;
      const currentCallbacks = Array.from(elementCallbacks);
      for (const callback of currentCallbacks) {
        if (!elementCallbacks.has(callback)) continue;
        try {
          callback(resizeEntry);
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
      if (hasError) throw firstError;
    }
  });

  const entry: ROPoolEntry = { observer, callbacks };
  pool.set(box, entry);
  return entry;
}
