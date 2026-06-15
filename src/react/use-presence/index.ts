import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from 'react';

import { useUpdateEffect } from '../_internal/use-update-effect.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresencePhase =
  | 'idle'
  | 'entering'
  | 'entered'
  | 'exiting'
  | 'exited';

export type PresenceReason =
  | 'initial'
  | 'show'
  | 'hide'
  | 'animation-end'
  | 'interrupted';

export type PresenceMode = 'mount' | 'reveal';

export interface UsePresenceOptions {
  show: boolean;
  mode?: PresenceMode;
  /** `'skip'` (default): no enter animation on first render. `'animate'`: animate on first render. */
  initial?: 'animate' | 'skip';
  /** Safety-net timeout in ms if transitionend/animationend doesn't fire. Default 5000. */
  exitDuration?: number;
}

export interface UsePresenceResult {
  phase: PresencePhase;
  phaseReason: PresenceReason;
  /** Convenience: `phase !== 'idle' && phase !== 'exited'` for conditional rendering in mount mode. */
  mounted: boolean;
  ref: RefObject<Element | null>;
}

// ---------------------------------------------------------------------------
// usePresence
// ---------------------------------------------------------------------------

/**
 * Composable presence primitive for mount/unmount lifecycle with CSS transitions.
 *
 * Stamps `data-phase` on the referenced element. CSS drives the animation,
 * JS manages the lifecycle timing (when to mount, when to unmount).
 *
 * @example
 * const { phase, ref, mounted } = usePresence({ show: isOpen });
 * if (!mounted) return null;
 * return <div ref={ref} data-phase={phase} className="transition-opacity data-[phase=entering]:opacity-0" />;
 */
export function usePresence(options: UsePresenceOptions): UsePresenceResult {
  const {
    show,
    mode = 'mount',
    initial = 'skip',
    exitDuration = 5000,
  } = options;

  const ref = useRef<Element | null>(null);

  const initialPhase: PresencePhase = computeInitialPhase(show, initial);

  const [phase, setPhase] = useState<PresencePhase>(initialPhase);
  const [reason, setReason] = useState<PresenceReason>('initial');

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRafRef = useRef<number>(0);
  const enterCleanupRef = useRef<(() => void) | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);

  const clearAllTimers = useCallback(() => {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterRafRef.current) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = 0;
    }
    if (enterCleanupRef.current) {
      enterCleanupRef.current();
      enterCleanupRef.current = null;
    }
    if (exitCleanupRef.current) {
      exitCleanupRef.current();
      exitCleanupRef.current = null;
    }
  }, []);

  useUpdateEffect(() => {
    clearAllTimers();

    if (show) {
      handleEnter(ref, setPhase, setReason, enterRafRef, enterCleanupRef);
    } else {
      handleExit(
        ref,
        mode,
        exitDuration,
        setPhase,
        setReason,
        clearAllTimers,
        exitTimerRef,
        exitCleanupRef,
      );
    }
  }, [show]);

  // `initial: 'animate'` starts the phase at 'entering' on mount. Since
  // useUpdateEffect skips the first render, the enter completion must be
  // scheduled here or the element stays stuck at 'entering' forever.
  useEffect(() => {
    if (initialPhase === 'entering') {
      handleEnter(ref, setPhase, setReason, enterRafRef, enterCleanupRef);
    }
    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mounted: boolean = phase !== 'idle' && phase !== 'exited';

  return { phase, phaseReason: reason, mounted, ref };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeInitialPhase(
  show: boolean,
  initial: 'animate' | 'skip',
): PresencePhase {
  if (!show) return 'idle';
  if (initial === 'skip') return 'entered';
  return 'entering';
}

function handleEnter(
  ref: RefObject<Element | null>,
  setPhase: (
    phase: PresencePhase | ((prev: PresencePhase) => PresencePhase),
  ) => void,
  setReason: (reason: PresenceReason) => void,
  enterRafRef: React.RefObject<number>,
  enterCleanupRef: React.RefObject<(() => void) | null>,
): void {
  setPhase((prev) => {
    setReason(prev === 'exiting' ? 'interrupted' : 'show');
    return 'entering';
  });

  const element: Element | null = ref.current;

  function completeEnter(): void {
    setPhase((current) => (current === 'entering' ? 'entered' : current));
    setReason('animation-end');
    cleanup();
  }

  function cleanup(): void {
    if (element) {
      element.removeEventListener('transitionend', completeEnter);
      element.removeEventListener('animationend', completeEnter);
    }
    if (enterRafRef.current) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = 0;
    }
    enterCleanupRef.current = null;
  }

  enterCleanupRef.current = cleanup;

  if (element) {
    element.addEventListener('transitionend', completeEnter, { once: true });
    element.addEventListener('animationend', completeEnter, { once: true });
  }

  enterRafRef.current = requestAnimationFrame(() => {
    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = 0;
      completeEnter();
    });
  });
}

function handleExit(
  ref: RefObject<Element | null>,
  mode: PresenceMode,
  exitDuration: number,
  setPhase: (
    phase: PresencePhase | ((prev: PresencePhase) => PresencePhase),
  ) => void,
  setReason: (reason: PresenceReason) => void,
  clearAllTimers: () => void,
  exitTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  exitCleanupRef: React.RefObject<(() => void) | null>,
): void {
  setPhase('exiting');
  setReason('hide');

  const exitTarget: PresencePhase = mode === 'reveal' ? 'idle' : 'exited';
  const element: Element | null = ref.current;

  function completeExit(): void {
    clearAllTimers();
    setPhase((current) => {
      if (current !== 'exiting') return current;
      setReason('animation-end');
      return exitTarget;
    });
  }

  function cleanup(): void {
    if (element) {
      element.removeEventListener('transitionend', completeExit);
      element.removeEventListener('animationend', completeExit);
    }
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    exitCleanupRef.current = null;
  }

  exitCleanupRef.current = cleanup;

  if (element) {
    element.addEventListener('transitionend', completeExit, { once: true });
    element.addEventListener('animationend', completeExit, { once: true });
  }

  exitTimerRef.current = setTimeout(completeExit, exitDuration);
}
