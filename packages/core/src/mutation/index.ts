import { linkAbortSignal } from '../_internal/abort';
import { cancelInput, scheduleInput } from '../_internal/clock';
import { noTargetError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MutationPhase = 'observing' | 'paused' | 'stopped';
export type MutationReason = 'initial' | 'started' | 'sight' | 'disposed';

export interface MutationOptions {
  target: Element;
  /** Standard MutationObserver configuration. */
  mutation: MutationObserverInit;
  /** Called once per rAF frame with coalesced records. Never per-record. */
  onMutations: (records: MutationRecord[]) => void;
  /** Called on phase transitions (observing, paused, stopped). */
  onPhaseChange?: (phase: MutationPhase, reason: MutationReason) => void;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Stops the observer when aborted. */
  signal?: AbortSignal;
}

export interface Mutation {
  readonly phase: MutationPhase;
  readonly phaseReason: MutationReason;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createMutation
// ---------------------------------------------------------------------------

/** Lifecycle-aware MutationObserver with rAF-coalesced callbacks. */
export function createMutation(options: MutationOptions): Mutation {
  if (typeof document === 'undefined') {
    serverContextError('createMutation');
  }

  const {
    target: element,
    mutation: mutationInit,
    onMutations,
    onPhaseChange,
    visibility = 'pause',
    intersectionOptions,
    signal,
  } = options;

  if (!element) noTargetError('createMutation');

  warnReflowStorm(mutationInit);

  let _phase: MutationPhase = 'paused';
  let _reason: MutationReason = 'initial';
  let stopped = false;
  let pendingRecords: MutationRecord[] = [];

  function setPhase(phase: MutationPhase, reason: MutationReason): void {
    const prev = _phase;
    _phase = phase;
    _reason = reason;
    if (prev !== phase) onPhaseChange?.(phase, reason);
  }

  function flushRecords(): void {
    if (stopped || pendingRecords.length === 0) return;
    const batch = pendingRecords;
    pendingRecords = [];
    onMutations(batch);
  }

  const mo = new MutationObserver((records) => {
    if (stopped || _phase !== 'observing') return;
    for (let i = 0, len = records.length; i < len; i++) {
      pendingRecords[pendingRecords.length] = records[i] as MutationRecord;
    }
    scheduleInput(flushRecords);
  });

  function startObserving(): void {
    if (stopped || _phase === 'observing') return;
    setPhase('observing', 'started');
    mo.observe(element, mutationInit);
  }

  function pauseObserving(reason: MutationReason): void {
    if (stopped || _phase === 'paused') return;
    setPhase('paused', reason);
    mo.disconnect();
    cancelInput(flushRecords);
    pendingRecords = [];
  }

  let cleanupVisibility: (() => void) | undefined;

  if (visibility === 'pause') {
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

    function onPageShow(event: PageTransitionEvent): void {
      if (!event.persisted) return;
      documentVisible = true;
      recompute();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

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
      window.removeEventListener('pageshow', onPageShow);
      unobserveIO();
    };
  } else {
    startObserving();
  }

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    cleanupVisibility?.();
    mo.disconnect();
    cancelInput(flushRecords);
    pendingRecords = [];
    setPhase('stopped', 'disposed');
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

// ---------------------------------------------------------------------------
// Internal helpers
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
