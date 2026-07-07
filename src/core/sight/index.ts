import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
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
  | 'all-hidden';

export interface SightOptions {
  element: Element;
  intersectionOptions?: IntersectionObserverInit;
  onPhaseChange?: (phase: SightPhase, reason: SightReason) => void;
  /** Abort signal that stops the observer when aborted. */
  signal?: AbortSignal;
}

export interface Sight {
  readonly phase: SightPhase;
  readonly phaseReason: SightReason;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createSight
// ---------------------------------------------------------------------------

/**
 * Visibility observer combining document focus and viewport intersection.
 *
 * `phase` is `'visible'` only when both the document is visible (not backgrounded)
 * and the element is within the viewport. Uses a shared IntersectionObserver
 * pool. Multiple `createSight` calls with the same options share one observer.
 *
 * @example
 * const sight = createSight({
 *   element: el,
 *   onPhaseChange: (phase) => phase === 'visible' ? loop.start() : loop.pause(),
 * });
 * // cleanup:
 * sight.stop();
 *
 * @remarks
 * `onPhaseChange` fires only on phase transitions, not on every IntersectionObserver callback.
 */
export function createSight(options: SightOptions): Sight {
  if (typeof document === 'undefined') {
    serverContextError('createSight');
  }

  const { element, intersectionOptions, onPhaseChange, signal } = options;

  if (!element) noElementError('createSight');

  let _phase: SightPhase = 'unknown';
  let _reason: SightReason = 'initial';
  let stopped = false;

  let documentVisible: boolean = !document.hidden;
  let elementInView = false;

  function recompute(trigger: SightReason): void {
    if (stopped) return;

    const prev = _phase;
    const next: SightPhase =
      documentVisible && elementInView ? 'visible' : 'hidden';

    _reason =
      next === 'hidden' && !documentVisible && !elementInView
        ? 'all-hidden'
        : trigger;

    if (next === prev) return;
    _phase = next;
    onPhaseChange?.(_phase, _reason);
  }

  // --- Signal handlers ---

  function onVisibilityChange(): void {
    documentVisible = !document.hidden;
    recompute('document');
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    documentVisible = true;
    recompute('bfcache');
  }

  function onIntersection(entry: IntersectionObserverEntry): void {
    elementInView = entry.isIntersecting;
    recompute('viewport');
  }

  // --- Subscribe ---

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  const unobserveIO: () => void = observeIntersection({
    element,
    onIntersect: onIntersection,
    ...intersectionOptions,
  });

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    unobserveIO();
    _phase = 'hidden';
    _reason = 'initial';
  }

  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    get phase() {
      return stopped ? 'hidden' : _phase;
    },
    get phaseReason() {
      return _reason;
    },
    stop,
  };
}
