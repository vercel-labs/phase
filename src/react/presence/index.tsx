import {
  useImperativeHandle,
  type ComponentProps,
  type JSX,
  type Ref,
} from 'react';

import { usePresence, type PresenceMode } from '../use-presence/index.js';

export interface PresenceProps extends ComponentProps<'div'> {
  show: boolean;
  mode?: PresenceMode;
  /** `'skip'` (default): no enter animation on first render. `'animate'`: animate on first render. */
  initial?: 'animate' | 'skip';
  /** Safety-net timeout in ms if transitionend/animationend doesn't fire. Default 5000. */
  exitDuration?: number;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Renders a `div` that manages its own mounting lifecycle.
 * Auto-stamps `data-phase` with the current PresencePhase value.
 *
 * @example
 * <Presence
 *   show={isOpen}
 *   className="transition-opacity data-[phase=entering]:opacity-0 data-[phase=exiting]:opacity-0"
 * >
 *   Modal content
 * </Presence>
 */
export function Presence({
  show,
  mode,
  initial,
  exitDuration,
  ref: forwardedRef,
  children,
  ...divProps
}: PresenceProps): JSX.Element | null {
  const { phase, ref, mounted } = usePresence({
    show,
    mode,
    initial,
    exitDuration,
  });

  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  if (!mounted && mode !== 'reveal') return null;

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
