import {
  useImperativeHandle,
  type ComponentProps,
  type JSX,
  type Ref,
} from 'react';

import { usePresence, type PresenceMode } from '../use-presence';

export interface PresenceProps extends ComponentProps<'div'> {
  show: boolean;
  mode?: PresenceMode;
  /** Controls first-mount behavior. `'animate'` (default): enter animation plays. `'instant'`: appears immediately. */
  enter?: 'animate' | 'instant';
  /** Safety-net timeout in ms if transitionend/animationend doesn't fire during exit. Default 5000. */
  exitDuration?: number;
  /** Whether to respect the user's reduced motion preference. Default `'respect'`. */
  reducedMotion?: 'respect' | 'ignore';
  ref?: Ref<HTMLDivElement>;
}

/**
 * Renders a `div` that manages its own mounting lifecycle.
 *
 * Stamps `data-phase` for exit animations and `data-enter="animate"` to gate
 * CSS `@starting-style` enter animations. Reduced motion is handled automatically.
 *
 * @example
 * <Presence
 *   show={isOpen}
 *   className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
 * >
 *   Modal content
 * </Presence>
 */
export function Presence({
  show,
  mode,
  enter: enterOption,
  exitDuration,
  reducedMotion,
  ref: forwardedRef,
  children,
  ...divProps
}: PresenceProps): JSX.Element | null {
  const { phase, ref, mounted, enter } = usePresence({
    show,
    mode,
    enter: enterOption,
    exitDuration,
    reducedMotion,
  });

  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  if (!mounted && mode !== 'reveal') return null;

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
