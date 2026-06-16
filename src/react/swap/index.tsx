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

import { missingContextError } from '../../core/_internal/errors';
import { usePresence } from '../use-presence';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SwapContext {
  current: string;
  active: string;
  exitDuration: number;
  /** 'instant' on first mount (prevents CLS), 'animate' on subsequent swaps. */
  enter: 'animate' | 'instant';
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
 *   <Swap.State id="success" className="transition-all data-[enter=animate]:starting:opacity-0">
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
  const [current, setCurrent] = useState(active);
  const [hasSwapped, setHasSwapped] = useState(false);
  const activeRef = useSyncedRef(active);

  const onExited = useCallback(
    (id: string): void => {
      setHasSwapped(true);
      setCurrent((cur) => (cur === id ? activeRef.current : cur));
    },
    [activeRef],
  );

  const enter: 'animate' | 'instant' = hasSwapped ? 'animate' : 'instant';

  const ctx: SwapContext = useMemo(
    () => ({ current, active, exitDuration, enter, onExited }),
    [current, active, exitDuration, enter, onExited],
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
  const show: boolean = isCurrent && ctx.active === id;

  const { phase, ref, mounted, enter } = usePresence({
    show,
    mode: 'mount',
    enter: ctx.enter,
    exitDuration: ctx.exitDuration,
  });

  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  useEffect(() => {
    if (isCurrent && !show && phase === 'exited') {
      ctx.onExited(id);
    }
  }, [isCurrent, show, phase, id, ctx]);

  if (!isCurrent || !mounted) return null;

  return (
    <div
      {...divProps}
      ref={ref as React.RefObject<HTMLDivElement | null>}
      data-phase={phase}
      data-enter={enter === 'animate' ? 'animate' : undefined}
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
