import {
  createContext,
  use,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useImperativeHandle,
  type ComponentProps,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';

import { missingContextError } from '../../core/_internal/errors.js';
import { usePresence } from '../use-presence/index.js';
import { useSyncedRef } from '../use-synced-ref/index.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SwapContext {
  /** The id currently being displayed (may be exiting). */
  current: string;
  /** The id the consumer wants displayed (the target). */
  active: string;
  exitDuration: number;
  /** 'skip' on first mount (prevents CLS), 'animate' on subsequent swaps. */
  initial: 'animate' | 'skip';
  onExited: (id: string) => void;
}

const SwapCtx = createContext<SwapContext | null>(null);

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

export interface SwapProps extends ComponentProps<'div'> {
  active: string;
  exitDuration?: number;
  children: ReactNode;
}

/**
 * Coordinated exit-then-enter transitions for N states.
 * Only one state is ever entering or exiting at a time — no overlap.
 *
 * The currently displayed state fully exits before the new state enters.
 * Rapid changes (A->B->C during A's exit) skip intermediate states and
 * advance directly to the latest `active`.
 *
 * @example
 * <Swap active={success ? 'success' : 'form'}>
 *   <Swap.State id="form" className="transition-all data-[phase=exiting]:opacity-0">
 *     <Form />
 *   </Swap.State>
 *   <Swap.State id="success" className="transition-all data-[phase=entering]:opacity-0">
 *     <SuccessMessage />
 *   </Swap.State>
 * </Swap>
 */
function SwapRoot({
  active,
  exitDuration = 5000,
  children,
  ...divProps
}: SwapProps): JSX.Element {
  // The id actually being rendered. Only advanced when the old element finishes exiting.
  const [current, setCurrent] = useState(active);

  // Tracks whether at least one swap has happened — first mount uses 'skip'
  // (no enter animation, prevents CLS), subsequent entries animate in.
  const [hasSwapped, setHasSwapped] = useState(false);

  // Always holds the latest `active` so the onExited callback can read it
  // without needing to be recreated (keeping stable identity for the context).
  const activeRef = useSyncedRef(active);

  // Called by SwapState when the exiting element's usePresence reaches 'exited'.
  // Advances `current` to whatever `active` is NOW (not when the exit started),
  // so rapid A->B->C skips B and goes straight to C.
  const onExited = useCallback(
    (id: string): void => {
      setHasSwapped(true);
      setCurrent((cur) => (cur === id ? activeRef.current : cur));
    },
    [activeRef],
  );

  const initial: 'animate' | 'skip' = hasSwapped ? 'animate' : 'skip';

  const ctx: SwapContext = useMemo(
    () => ({ current, active, exitDuration, initial, onExited }),
    [current, active, exitDuration, initial, onExited],
  );

  return (
    <SwapCtx.Provider value={ctx}>
      <div {...divProps}>{children}</div>
    </SwapCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Swap.State
// ---------------------------------------------------------------------------

export interface SwapStateProps extends ComponentProps<'div'> {
  id: string;
  ref?: Ref<HTMLDivElement>;
}

function SwapState({
  id,
  ref: forwardedRef,
  children,
  ...divProps
}: SwapStateProps): JSX.Element | null {
  const ctx = use(SwapCtx);
  if (!ctx) missingContextError('Swap.State', 'Swap');

  const isCurrent: boolean = ctx.current === id;
  // show=true when this is the current element AND it's still the active target.
  // When active changes away, show flips to false and usePresence drives the exit.
  const show: boolean = isCurrent && ctx.active === id;

  const { phase, ref, mounted } = usePresence({
    show,
    mode: 'mount',
    initial: ctx.initial,
    exitDuration: ctx.exitDuration,
  });

  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  // When this element finishes exiting, notify the parent to advance `current`.
  useEffect(() => {
    if (isCurrent && !show && phase === 'exited') {
      ctx.onExited(id);
    }
  }, [isCurrent, show, phase, id, ctx]);

  // Only the current element renders; all others return null.
  if (!isCurrent || !mounted) return null;

  return (
    <div
      {...divProps}
      ref={ref as React.RefObject<HTMLDivElement | null>}
      data-phase={phase}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compound component export
// ---------------------------------------------------------------------------

export const Swap: typeof SwapRoot & { State: typeof SwapState } =
  Object.assign(SwapRoot, { State: SwapState });
