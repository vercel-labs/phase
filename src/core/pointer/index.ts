import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Types
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
  /**
   * Called once per rAF frame with the latest pointer position.
   * Reads `getBoundingClientRect` at most once per frame.
   */
  onPointer: (state: PointerState) => void;
  /** Pause tracking while the element is off-screen. Default `true`. */
  visibilityAware?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Abort signal that stops the tracker when aborted. */
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

/**
 * Lifecycle-aware pointer tracker that reads `getBoundingClientRect` once per
 * rAF frame instead of per `pointermove` event. Auto-pauses when the element
 * is off-screen.
 */
export function createPointer(options: PointerOptions): Pointer {
  if (typeof document === 'undefined') {
    serverContextError('createPointer');
  }

  const {
    element,
    onPointer,
    visibilityAware = true,
    intersectionOptions,
    signal,
  } = options;

  if (!element) noElementError('createPointer');

  let _phase: PointerPhase = 'idle';
  let _reason: PointerReason = 'initial';
  let stopped = false;

  const _state: PointerState = { x: 0, y: 0, active: false };

  // rAF batching — one getBoundingClientRect per frame maximum
  let rafId = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let dirty = false;

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

  // --- Pointer event handlers ---

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
    _phase = 'tracking';
    _reason = 'enter';
  }

  function onPointerLeave(): void {
    if (stopped) return;
    _state.active = false;
    _phase = 'idle';
    _reason = 'leave';
    onPointer(_state);
  }

  // --- Visibility gating ---

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

  if (visibilityAware) {
    let elementInView = false;
    let documentVisible = !document.hidden;

    function recompute(): void {
      if (stopped) return;
      if (documentVisible && elementInView) {
        attachListeners();
      } else {
        detachListeners();
        if (_state.active) {
          _state.active = false;
          _phase = 'idle';
          _reason = 'sight';
        }
      }
    }

    function onVisChange(): void {
      documentVisible = !document.hidden;
      recompute();
    }

    document.addEventListener('visibilitychange', onVisChange);

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
      unobserveIO();
    };
  } else {
    attachListeners();
  }

  // --- Teardown ---

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    cleanupVisibility?.();
    detachListeners();
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    _state.active = false;
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
    get state() {
      return _state;
    },
    stop,
  };
}
