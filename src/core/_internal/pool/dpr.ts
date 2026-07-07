type DprCallback = (dpr: number) => void;

const listeners = new Set<DprCallback>();

// Last-bound DPR. Set by bind() before the MQL is created; only meaningful
// while a subscription is active.
let currentDpr = 1;

let mql: MediaQueryList | null = null;
let handler: (() => void) | null = null;

/**
 * Subscribe to devicePixelRatio changes (e.g. user drags window between monitors).
 *
 * Uses a single shared `matchMedia` query that re-subscribes on every DPR change,
 * so chained monitor switches (A -> B -> C) are all caught.
 *
 * @returns Cleanup function that removes the subscriber.
 */
export function subscribeDpr(callback: DprCallback): () => void {
  listeners.add(callback);

  if (listeners.size === 1) {
    bind();
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    listeners.delete(callback);
    if (listeners.size === 0) {
      unbind();
    }
  };
}

/** Read the current devicePixelRatio. */
export function readDpr(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

// ---------------------------------------------------------------------------
// Internal: bind/unbind the resolution MQL
// ---------------------------------------------------------------------------

function bind(): void {
  if (typeof matchMedia === 'undefined') return;
  currentDpr = window.devicePixelRatio || 1;
  mql = matchMedia(`(resolution: ${currentDpr}dppx)`);
  handler = onDprChange;
  mql.addEventListener('change', handler);
}

function unbind(): void {
  if (mql && handler) {
    mql.removeEventListener('change', handler);
  }
  mql = null;
  handler = null;
}

function onDprChange(): void {
  const newDpr: number = window.devicePixelRatio || 1;
  if (newDpr === currentDpr) return;
  currentDpr = newDpr;

  // Re-subscribe with the new DPR value so the next change is caught.
  unbind();
  bind();

  for (const cb of listeners) cb(newDpr);
}
