import { linkAbortSignal } from '../_internal/abort';
import { isDocument } from '../_internal/dom';
import { noTargetError, serverContextError } from '../_internal/errors';
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
  /**
   * Scroll container to track. Pass an `Element` for a scrollable element, or
   * `document` to track the page scroller.
   */
  target: Element | Document;
  /** Called once per rAF frame with the latest scroll position + progress. */
  onScroll: (state: ScrollState) => void;
  /** Called on phase transitions (tracking, paused, stopped). */
  onPhaseChange?: (phase: ScrollPhase, reason: ScrollReason) => void;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** IO options forwarded to the visibility observer. Ignored for `document`. */
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
 *
 * Pass `document` to track the page. Offsets and geometry then come from
 * `document.scrollingElement`, and because the page is always in view,
 * `visibility: 'pause'` reacts to tab visibility alone rather than an
 * `IntersectionObserver`.
 */
export function createScroll(options: CreateScrollOptions): Scroll {
  if (typeof document === 'undefined') {
    serverContextError('createScroll');
  }

  const {
    target,
    onScroll,
    onPhaseChange,
    visibility = 'pause',
    intersectionOptions,
    signal,
  } = options;

  if (!target) noTargetError('createScroll');

  // Page mode reads offsets and geometry from the scrolling element, while the
  // `scroll` event stays on the Document (where the page fires it). Element mode
  // uses the same node for both.
  let pageDoc: Document | undefined;
  let scroller: Element;
  if (isDocument(target)) {
    pageDoc = target;
    // `scrollingElement` is `body` in quirks mode and absent in some test DOMs.
    scroller = target.scrollingElement ?? target.documentElement;
  } else {
    scroller = target;
  }

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
  let needsMeasure = false;
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
    const x = scroller.scrollLeft;
    const y = scroller.scrollTop;
    _state.x = x < 0 ? 0 : x > maxX ? maxX : x;
    _state.y = y < 0 ? 0 : y > maxY ? maxY : y;
    _state.progressX = maxX > 0 ? _state.x / maxX : 0;
    _state.progressY = maxY > 0 ? _state.y / maxY : 0;
  }

  // The one reflow-heavy path. Runs on attach, on ResizeObserver, and on an
  // explicit `measure()`, never per scroll event. Skipped while paused/off-screen
  // (re-entry re-measures), so `measure()` never forces an off-screen reflow.
  function measure(): void {
    if (stopped || !listenersAttached) return;
    const scrollWidth = scroller.scrollWidth;
    const clientWidth = scroller.clientWidth;
    const scrollHeight = scroller.scrollHeight;
    const clientHeight = scroller.clientHeight;

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
    if (stopped) return;
    // A resize and a scroll landing in the same frame collapse into one
    // callback: measure() recomputes position and reports on its own.
    if (needsMeasure) {
      needsMeasure = false;
      dirty = false;
      measure();
      return;
    }
    if (!dirty) return;
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
    needsMeasure = false;
  }

  function onScrollEvent(): void {
    if (stopped) return;
    dirty = true;
    scheduleFlush();
  }

  function onROResize(): void {
    if (stopped) return;
    // Page mode hears about a resize twice (observer + window `resize`), and
    // `resize` is not frame-aligned the way an observer callback is. Defer to
    // the frame so one resize costs one layout read, not two. Element mode has
    // a single frame-aligned source, so it measures inline.
    if (pageDoc) {
      needsMeasure = true;
      scheduleFlush();
      return;
    }
    measure();
  }

  function attachListeners(): void {
    if (listenersAttached) return;
    listenersAttached = true;
    target.addEventListener('scroll', onScrollEvent, { passive: true });
    unobserveRO = observeResize(scroller, onROResize);
    // A viewport height change (mobile URL bar, window resize) moves `maxY`
    // without resizing the scrolling element's content box, so the observer
    // alone would leave page geometry stale.
    if (pageDoc) window.addEventListener('resize', onROResize);
    measure();
  }

  function detachListeners(): void {
    if (!listenersAttached) return;
    listenersAttached = false;
    target.removeEventListener('scroll', onScrollEvent);
    unobserveRO?.();
    unobserveRO = undefined;
    if (pageDoc) window.removeEventListener('resize', onROResize);
    cancelFlush();
  }

  let cleanupVisibility: (() => void) | undefined;

  if (visibility === 'pause') {
    // The page is always in view, so only tab visibility gates page mode.
    let elementInView = pageDoc !== undefined;
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

    const unobserveIO = pageDoc
      ? undefined
      : observeIntersection({
          element: scroller,
          onIntersect: (entry) => {
            elementInView = entry.isIntersecting;
            recompute();
          },
          ...intersectionOptions,
        });

    cleanupVisibility = () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pageshow', onPageShow);
      unobserveIO?.();
    };

    recompute();
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
    cancelFlush();
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
