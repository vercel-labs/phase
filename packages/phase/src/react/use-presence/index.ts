import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from 'react';

import { prefersReducedMotion } from '../../core/reduced-motion';
import { useUpdateEffect } from '../_internal/use-update-effect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresencePhase = 'idle' | 'entered' | 'exiting' | 'exited';

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
  /** Controls first-mount behavior. `'animate'` (default): enter animation plays. `'instant'`: appears immediately. */
  enter?: 'animate' | 'instant';
  /** Safety-net timeout in ms if transitionend/animationend doesn't fire during exit. Default 5000. */
  exitDuration?: number;
  /** Whether to respect the user's reduced motion preference. Default `'respect'`. */
  reducedMotion?: 'respect' | 'ignore';
}

export interface UsePresenceResult {
  phase: PresencePhase;
  phaseReason: PresenceReason;
  /** Convenience: `phase !== 'idle' && phase !== 'exited'` for conditional rendering in mount mode. */
  mounted: boolean;
  ref: RefObject<Element | null>;
  /** Whether the component should stamp `data-enter="animate"`. Accounts for enter option + reduced motion. */
  enter: 'animate' | 'instant';
}

// ---------------------------------------------------------------------------
// usePresence
// ---------------------------------------------------------------------------

/**
 * Composable presence primitive for mount/unmount lifecycle with CSS transitions.
 *
 * Enter animations use CSS `@starting-style`, gated by `data-enter="animate"`.
 * Exit animations are JS-coordinated: waits for `transitionend`/`animationend`
 * before unmounting.
 *
 * @example
 * const { phase, ref, mounted, enter } = usePresence({ show: isOpen });
 * if (!mounted) return null;
 * return (
 *   <div ref={ref} data-phase={phase} data-enter={enter === 'animate' ? 'animate' : undefined}
 *     className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0" />
 * );
 */
export function usePresence(options: UsePresenceOptions): UsePresenceResult {
  const {
    show,
    mode = 'mount',
    enter: enterOption = 'animate',
    exitDuration = 5000,
    reducedMotion = 'respect',
  } = options;

  const ref = useRef<Element | null>(null);

  const initialPhase: PresencePhase = show ? 'entered' : 'idle';

  const [phase, setPhase] = useState<PresencePhase>(initialPhase);
  const [reason, setReason] = useState<PresenceReason>('initial');

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitCleanupRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (exitCleanupRef.current) {
      exitCleanupRef.current();
      exitCleanupRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useUpdateEffect(() => {
    clearTimers();

    if (show) {
      setPhase((prev) => {
        setReason(prev === 'exiting' ? 'interrupted' : 'show');
        return 'entered';
      });
    } else {
      const shouldSkipAnimation =
        reducedMotion === 'respect' && prefersReducedMotion();

      if (shouldSkipAnimation) {
        const exitTarget: PresencePhase = mode === 'reveal' ? 'idle' : 'exited';
        setPhase(exitTarget);
        setReason('animation-end');
      } else {
        handleExit(
          ref,
          mode,
          exitDuration,
          setPhase,
          setReason,
          clearTimers,
          exitTimerRef,
          exitCleanupRef,
        );
      }
    }
  }, [show]);

  const mounted: boolean = phase !== 'idle' && phase !== 'exited';

  const isFirstMount = reason === 'initial';
  const wantsAnimation = !(isFirstMount && enterOption === 'instant');
  const motionAllowed = reducedMotion === 'ignore' || !prefersReducedMotion();
  const enter: 'animate' | 'instant' =
    wantsAnimation && motionAllowed ? 'animate' : 'instant';

  return { phase, phaseReason: reason, mounted, ref, enter };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function handleExit(
  ref: RefObject<Element | null>,
  mode: PresenceMode,
  exitDuration: number,
  setPhase: (
    phase: PresencePhase | ((prev: PresencePhase) => PresencePhase),
  ) => void,
  setReason: (reason: PresenceReason) => void,
  clearTimers: () => void,
  exitTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  exitCleanupRef: React.RefObject<(() => void) | null>,
): void {
  setPhase('exiting');
  setReason('hide');

  const exitTarget: PresencePhase = mode === 'reveal' ? 'idle' : 'exited';
  const element: Element | null = ref.current;

  function completeExit(): void {
    clearTimers();
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
