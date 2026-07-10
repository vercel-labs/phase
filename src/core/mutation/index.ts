import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MutationPhase = 'observing' | 'paused' | 'stopped';
export type MutationReason = 'initial' | 'started' | 'sight' | 'disposed';

export interface MutationOptions {
  element: Element;
  /** MutationObserver configuration. */
  mutation: MutationObserverInit;
  /**
   * Called once per rAF frame with all coalesced records since the last frame.
   * Never called synchronously per-record.
   */
  onMutations: (records: MutationRecord[]) => void;
  /** Pause observation while the element is off-screen. Default `true`. */
  visibilityAware?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Abort signal that stops the observer when aborted. */
  signal?: AbortSignal;
}

export interface Mutation {
  readonly phase: MutationPhase;
  readonly phaseReason: MutationReason;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Dev-mode warning for the reflow-storm shape
// ---------------------------------------------------------------------------

const REFLOW_STORM_ATTRIBUTES = new Set(['style', 'class']);

function warnReflowStorm(opts: MutationObserverInit): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!opts.subtree) return;
  const filter = opts.attributeFilter;
  if (!filter) return;
  if (!filter.some((attr) => REFLOW_STORM_ATTRIBUTES.has(attr))) return;

  console.warn(
    '[phase] createMutation: observing subtree + attributeFilter including ' +
      '"style" or "class" fires on every descendant style/class change ' +
      '(animations, hovers, framework churn). Narrow the scope or use a ' +
      'visibility signal instead.',
  );
}

// ---------------------------------------------------------------------------
// createMutation
// ---------------------------------------------------------------------------

/**
 * Lifecycle-aware MutationObserver that coalesces records into one rAF-batched
 * callback. Never fires per-record synchronously. Auto-pauses when the observed
 * element is off-screen (via pooled IntersectionObserver).
 */
export function createMutation(options: MutationOptions): Mutation {
  if (typeof document === 'undefined') {
    serverContextError('createMutation');
  }

  const {
    element,
    mutation: mutationInit,
    onMutations,
    visibilityAware = true,
    intersectionOptions,
    signal,
  } = options;

  if (!element) noElementError('createMutation');

  warnReflowStorm(mutationInit);

  let _phase: MutationPhase = 'paused';
  let _reason: MutationReason = 'initial';
  let stopped = false;

  // --- rAF batching ---

  let pendingRecords: MutationRecord[] = [];
  let rafId = 0;

  function flushRecords(): void {
    rafId = 0;
    if (pendingRecords.length === 0) return;
    const batch = pendingRecords;
    pendingRecords = [];
    onMutations(batch);
  }

  function scheduleFlush(): void {
    if (rafId !== 0) return;
    rafId = requestAnimationFrame(flushRecords);
  }

  const mo = new MutationObserver((records) => {
    if (stopped || _phase !== 'observing') return;
    for (const record of records) {
      pendingRecords.push(record);
    }
    scheduleFlush();
  });

  // --- Start/pause helpers ---

  function startObserving(): void {
    if (stopped || _phase === 'observing') return;
    _phase = 'observing';
    _reason = 'started';
    mo.observe(element, mutationInit);
  }

  function pauseObserving(reason: MutationReason): void {
    if (stopped || _phase === 'paused') return;
    _phase = 'paused';
    _reason = reason;
    mo.disconnect();
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pendingRecords = [];
  }

  // --- Visibility gating ---

  let cleanupVisibility: (() => void) | undefined;

  if (visibilityAware) {
    let elementInView = false;
    let documentVisible = !document.hidden;

    function recompute(): void {
      if (stopped) return;
      if (documentVisible && elementInView) startObserving();
      else pauseObserving('sight');
    }

    function onVisibilityChange(): void {
      documentVisible = !document.hidden;
      recompute();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    const unobserveIO = observeIntersection({
      element,
      onIntersect: (entry) => {
        elementInView = entry.isIntersecting;
        recompute();
      },
      ...intersectionOptions,
    });

    cleanupVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unobserveIO();
    };
  } else {
    startObserving();
  }

  // --- Teardown ---

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    cleanupVisibility?.();
    mo.disconnect();
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pendingRecords = [];
    _phase = 'stopped';
    _reason = 'disposed';
  }

  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    get phase() {
      return _phase;
    },
    get phaseReason() {
      return _reason;
    },
    stop,
  };
}
