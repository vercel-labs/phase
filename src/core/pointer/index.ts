import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PointerPhase = 'idle' | 'tracking' | 'stopped';
export type PointerReason =
  | 'initial'
  | 'enter'
  | 'leave'
  | 'sight'
  | 'disposed';

export interface PointerState {
  /** X position relative to the element's top-left, in CSS pixels. */
  x: number;
  /** Y position relative to the element's top-left, in CSS pixels. */
  y: number;
  /** Whether a pointer is currently over the element. */
  active: boolean;
}

export interface PointerOptions {
  element: Element;
  /** Called once per rAF frame with the latest pointer position. */
  onPointer: (state: PointerState) => void;
  /** Called on phase transitions (idle, tracking, stopped). */
  onPhaseChange?: (phase: PointerPhase, reason: PointerReason) => void;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Stops the tracker when aborted. */
  signal?: AbortSignal;
}

export interface Pointer {
  readonly phase: PointerPhase;
  readonly phaseReason: PointerReason;
  readonly state: Readonly<PointerState>;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createPointer
// ---------------------------------------------------------------------------

/** Lifecycle-aware pointer tracker with rAF-batched `getBoundingClientRect`. */
export function createPointer(options: PointerOptions): Pointer {
  if (typeof document === 'undefined') {
    serverContextError('createPointer');
  }

  const {
    element,
    onPointer,
    onPhaseChange,
    visibility = 'pause',
    intersectionOptions,
    signal,
  } = options;

  if (!element) noElementError('createPointer');

  let _phase: PointerPhase = 'idle';
  let _reason: PointerReason = 'initial';
  let stopped = false;
  const _state: PointerState = { x: 0, y: 0, active: false };

  let rafId = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let dirty = false;

  function setPhase(phase: PointerPhase, reason: PointerReason): void {
    const prev = _phase;
    _phase = phase;
    _reason = reason;
    if (prev !== phase) onPhaseChange?.(phase, reason);
  }

  function flush(): void {
    rafId = 0;
    if (!dirty || stopped) return;
    dirty = false;
    const rect = element.getBoundingClientRect();
    _state.x = lastClientX - rect.left;
    _state.y = lastClientY - rect.top;
    onPointer(_state);
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

  function onPointerMove(e: Event): void {
    if (stopped || _phase !== 'tracking') return;
    const pe = e as PointerEvent;
    lastClientX = pe.clientX;
    lastClientY = pe.clientY;
    dirty = true;
    scheduleFlush();
  }

  function onPointerEnter(): void {
    if (stopped) return;
    _state.active = true;
    setPhase('tracking', 'enter');
  }

  function onPointerLeave(): void {
    if (stopped) return;
    cancelFlush();
    _state.active = false;
    setPhase('idle', 'leave');
    onPointer(_state);
  }

  let cleanupVisibility: (() => void) | undefined;
  let listenersAttached = false;

  function attachListeners(): void {
    if (listenersAttached) return;
    listenersAttached = true;
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointerleave', onPointerLeave);
  }

  function detachListeners(): void {
    if (!listenersAttached) return;
    listenersAttached = false;
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerenter', onPointerEnter);
    element.removeEventListener('pointerleave', onPointerLeave);
  }

  if (visibility === 'pause') {
    let elementInView = false;
    let documentVisible = !document.hidden;

    function recompute(): void {
      if (stopped) return;
      if (documentVisible && elementInView) {
        attachListeners();
      } else {
        detachListeners();
        if (_state.active) {
          cancelFlush();
          _state.active = false;
          setPhase('idle', 'sight');
        }
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
    _state.active = false;
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
    stop,
  };
}
