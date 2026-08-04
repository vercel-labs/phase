import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';
import { observeResize } from '../_internal/pool/ro-pool';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScrollPhase = 'tracking' | 'paused' | 'stopped';
export type ScrollReason = 'initial' | 'started' | 'sight' | 'disposed';

export interface ScrollState {
  /** `scrollLeft`, clamped to `[0, maxX]`. */
  x: number;
  /** `scrollTop`, clamped to `[0, maxY]`. */
  y: number;
  /** Max horizontal scroll distance (`scrollWidth - clientWidth`, never negative). */
  maxX: number;
  /** Max vertical scroll distance (`scrollHeight - clientHeight`, never negative). */
  maxY: number;
  /** Horizontal scroll progress `x / maxX` (0–1). `0` when not scrollable. */
  progressX: number;
  /** Vertical scroll progress `y / maxY` (0–1). `0` when not scrollable. */
  progressY: number;
  /** Visible horizontal fraction `clientWidth / scrollWidth` (0–1). Thumb `scaleX`. */
  visibleX: number;
  /** Visible vertical fraction `clientHeight / scrollHeight` (0–1). Thumb `scaleY`. */
  visibleY: number;
}

// `ScrollOptions` is a lib.dom global; do not shadow it (see code-style rules).
export interface CreateScrollOptions {
  element: Element;
  /** Called once per rAF frame with the latest scroll position + progress. */
  onScroll: (state: ScrollState) => void;
  /** Called on phase transitions (tracking, paused, stopped). */
  onPhaseChange?: (phase: ScrollPhase, reason: ScrollReason) => void;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Stops the tracker when aborted. */
  signal?: AbortSignal;
}

export interface Scroll {
  readonly phase: ScrollPhase;
  readonly phaseReason: ScrollReason;
  readonly state: Readonly<ScrollState>;
  /** Re-read geometry (`scrollWidth`/`clientWidth`) after a content change. */
  measure(): void;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createScroll
// ---------------------------------------------------------------------------

/**
 * Lifecycle-aware scroll tracker. Reads `scrollLeft`/`scrollTop` once per rAF
 * frame and reads the reflow-heavy geometry (`scrollWidth`/`clientWidth`) only
 * on resize or explicit `measure()`, never on the scroll path. Auto-pauses when
 * the element is off-screen.
 *
 * This is to `scroll` + `scrollWidth` what `createPointer` is to `pointermove`
 * + `getBoundingClientRect`: the layout read is batched off the hot path so the
 * per-scroll work is a single cheap position read plus math on cached geometry.
 */
export function createScroll(options: CreateScrollOptions): Scroll {
  if (typeof document === 'undefined') {
    serverContextError('createScroll');
  }

  const {
    element,
    onScroll,
    onPhaseChange,
    visibility = 'pause',
    intersectionOptions,
    signal,
  } = options;

  if (!element) noElementError('createScroll');

  let _phase: ScrollPhase = 'paused';
  let _reason: ScrollReason = 'initial';
  let stopped = false;
  const _state: ScrollState = {
    x: 0,
    y: 0,
    maxX: 0,
    maxY: 0,
    progressX: 0,
    progressY: 0,
    visibleX: 1,
    visibleY: 1,
  };

  let rafId = 0;
  let dirty = false;
  let listenersAttached = false;
  let unobserveRO: (() => void) | undefined;

  function setPhase(phase: ScrollPhase, reason: ScrollReason): void {
    const prev = _phase;
    _phase = phase;
    _reason = reason;
    if (prev !== phase) onPhaseChange?.(phase, reason);
  }

  // Reads only scroll offsets (cheap, post-layout) and derives progress from
  // the cached geometry. No `scrollWidth`/`clientWidth` here; that stays on
  // the resize path.
  function computePosition(): void {
    const { maxX, maxY } = _state;
    const x = element.scrollLeft;
    const y = element.scrollTop;
    _state.x = x < 0 ? 0 : x > maxX ? maxX : x;
    _state.y = y < 0 ? 0 : y > maxY ? maxY : y;
    _state.progressX = maxX > 0 ? _state.x / maxX : 0;
    _state.progressY = maxY > 0 ? _state.y / maxY : 0;
  }

  // The one reflow-heavy path. Runs on attach, on ResizeObserver, and on an
  // explicit `measure()`, never per scroll event.
  function measure(): void {
    if (stopped) return;
    const scrollWidth = element.scrollWidth;
    const clientWidth = element.clientWidth;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    const maxX = scrollWidth - clientWidth;
    const maxY = scrollHeight - clientHeight;
    _state.maxX = maxX > 0 ? maxX : 0;
    _state.maxY = maxY > 0 ? maxY : 0;
    _state.visibleX = maxX > 0 ? clientWidth / scrollWidth : 1;
    _state.visibleY = maxY > 0 ? clientHeight / scrollHeight : 1;

    computePosition();
    onScroll(_state);
  }

  function flush(): void {
    rafId = 0;
    if (!dirty || stopped) return;
    dirty = false;
    computePosition();
    onScroll(_state);
  }

  function scheduleFlush(): void {
    if (rafId !== 0) return;
    rafId = requestAnimationFrame(flush);
  }

  function cancelFlush(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    dirty = false;
  }

  function onScrollEvent(): void {
    if (stopped) return;
    dirty = true;
    scheduleFlush();
  }

  function onROResize(): void {
    if (stopped) return;
    measure();
  }

  function attachListeners(): void {
    if (listenersAttached) return;
    listenersAttached = true;
    element.addEventListener('scroll', onScrollEvent, { passive: true });
    unobserveRO = observeResize(element, onROResize);
    measure();
  }

  function detachListeners(): void {
    if (!listenersAttached) return;
    listenersAttached = false;
    element.removeEventListener('scroll', onScrollEvent);
    unobserveRO?.();
    unobserveRO = undefined;
    cancelFlush();
  }

  let cleanupVisibility: (() => void) | undefined;

  if (visibility === 'pause') {
    let elementInView = false;
    let documentVisible = !document.hidden;

    function recompute(): void {
      if (stopped) return;
      const shouldTrack = documentVisible && elementInView;
      if (shouldTrack && !listenersAttached) {
        setPhase('tracking', 'started');
        attachListeners();
      } else if (!shouldTrack && listenersAttached) {
        detachListeners();
        setPhase('paused', 'sight');
      }
    }

    function onVisChange(): void {
      documentVisible = !document.hidden;
      recompute();
    }

    function onPageShow(event: PageTransitionEvent): void {
      if (!event.persisted) return;
      documentVisible = true;
      recompute();
    }

    document.addEventListener('visibilitychange', onVisChange);
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
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pageshow', onPageShow);
      unobserveIO();
    };
  } else {
    setPhase('tracking', 'started');
    attachListeners();
  }

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    cleanupVisibility?.();
    detachListeners();
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
    get state() {
      return _state;
    },
    measure,
    stop,
  };
}
