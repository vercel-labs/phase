import type { ComponentProps, JSX, ReactNode, Ref } from 'react';

import { prefersReducedMotion } from '../../core/reduced-motion';
import { useIdle } from '../use-idle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhenIdleProps extends ComponentProps<'div'> {
  /** Max ms to wait before mounting even if no idle period occurs. */
  timeout?: number;
  /** Content shown until the scheduled mount runs. */
  fallback?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// WhenIdle
// ---------------------------------------------------------------------------

/**
 * Mounts children after `requestIdleCallback` when available or in the next
 * task when it is not. One-shot (once mounted, stays mounted). Use it for
 * non-critical UI that can tolerate the fallback running before browser idle.
 *
 * Children are not server-rendered (idle never fires during SSR), so reserve
 * this for non-critical content. For viewport-gated mounting use `WhenVisible`;
 * to keep content in the DOM but skip painting use `Defer`.
 *
 * Enter animation uses CSS `@starting-style`, gated by `data-enter="animate"`.
 * Reduced motion is automatic: the attribute is not stamped when the user
 * prefers reduced motion.
 *
 * @example
 * <WhenIdle fallback={<Skeleton />}>
 *   <SecondaryPanel />
 * </WhenIdle>
 */
export function WhenIdle({
  timeout,
  fallback,
  children,
  ref: forwardedRef,
  ...divProps
}: WhenIdleProps): JSX.Element {
  const idle = useIdle({ timeout });

  if (!idle) {
    return <div {...divProps}>{fallback}</div>;
  }

  const motionAllowed = !prefersReducedMotion();

  return (
    <div
      {...divProps}
      ref={forwardedRef}
      data-phase="entered"
      data-enter={motionAllowed ? 'animate' : undefined}
    >
      {children}
    </div>
  );
}
