import { diagnostics } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SightPhase = 'unknown' | 'visible' | 'hidden';
export type SightReason =
  | 'initial'
  | 'viewport'
  | 'document'
  | 'bfcache'
  | 'both';

export interface SightOptions {
  element: Element;
  intersectionOptions?: IntersectionObserverInit;
  onPhaseChange?: (phase: SightPhase, reason: SightReason) => void;
}

export interface Sight {
  readonly phase: SightPhase;
  readonly phaseReason: SightReason;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// createSight
// ---------------------------------------------------------------------------

/**
 * Visibility observer combining document focus and viewport intersection.
 *
 * `phase` is `'visible'` only when both the document is visible (not backgrounded)
 * and the element is within the viewport. Uses a shared IntersectionObserver
 * pool — multiple `createSight` calls with the same options share one observer.
 *
 * @example
 * const sight = createSight({
 *   element: el,
 *   onPhaseChange: (phase) => phase === 'visible' ? loop.start() : loop.pause(),
 * });
 * // cleanup:
 * sight.dispose();
 *
 * @remarks
 * `onPhaseChange` fires only on phase transitions, not on every IntersectionObserver callback.
 */
export function createSight(options: SightOptions): Sight {
  if (typeof document === 'undefined') {
    throw diagnostics.server_context({ fn: 'createSight' });
  }

  const { element, intersectionOptions, onPhaseChange } = options;

  let _phase: SightPhase = 'unknown';
  let _reason: SightReason = 'initial';
  let disposed = false;

  let documentVisible: boolean = !document.hidden;
  let elementInView = false;

  function recompute(): void {
    if (disposed) return;

    const previousPhase: SightPhase = _phase;
    const newPhase: SightPhase = resolvePhase(documentVisible, elementInView);
    const newReason: SightReason = resolveReason(
      documentVisible,
      elementInView,
      _reason,
    );

    _reason = newReason;
    if (newPhase === previousPhase) return;

    _phase = newPhase;
    onPhaseChange?.(_phase, _reason);
  }

  // --- Signal handlers ---

  function onVisibilityChange(): void {
    documentVisible = !document.hidden;
    recompute();
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    // bfcache restore: visibilitychange doesn't fire for back/forward navigation.
    documentVisible = true;
    _reason = 'bfcache';
    recompute();
  }

  function onIntersection(entry: IntersectionObserverEntry): void {
    elementInView = entry.isIntersecting;
    _reason = 'viewport';
    recompute();
  }

  // --- Subscribe ---

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  const unobserveIO: () => void = observeIntersection(
    element,
    onIntersection,
    intersectionOptions,
  );

  // --- Dispose ---

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    unobserveIO();
    _phase = 'hidden';
    _reason = 'initial';
  }

  return {
    get phase() {
      return disposed ? 'hidden' : _phase;
    },
    get phaseReason() {
      return _reason;
    },
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePhase(docVisible: boolean, inView: boolean): SightPhase {
  if (docVisible && inView) return 'visible';
  return 'hidden';
}

/** Determine why the element is in its current visibility state. */
function resolveReason(
  docVisible: boolean,
  inView: boolean,
  currentReason: SightReason,
): SightReason {
  // Both visible: preserve the reason from whichever signal made it visible.
  // On the very first transition, default to 'viewport' (IO is the initial signal).
  if (docVisible && inView) {
    return currentReason === 'initial' ? 'viewport' : currentReason;
  }
  if (!docVisible && !inView) return 'both';
  if (!docVisible) return 'document';
  return 'viewport';
}
