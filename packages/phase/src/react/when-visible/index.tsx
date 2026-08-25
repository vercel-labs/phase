import {
  useRef,
  type ComponentProps,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';

import { prefersReducedMotion } from '../../core/reduced-motion';
import { useSight } from '../use-sight';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhenVisibleProps extends ComponentProps<'div'> {
  /** IntersectionObserver rootMargin. Default `'200px'` (generous headroom for preloading). */
  rootMargin?: string;
  /** IntersectionObserver threshold. */
  threshold?: number | number[];
  /** IntersectionObserver root element. */
  root?: Element | null;
  /** Content shown while awaiting intersection. Sentinel div is always rendered for IO. */
  fallback?: ReactNode;
  /** Forwarded to the rendered div in both states (the sentinel before visible, the entered div after). Populated at mount. */
  ref?: Ref<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// WhenVisible
// ---------------------------------------------------------------------------

/**
 * Mounts children when the element enters the viewport. One-shot (once
 * triggered, stays mounted).
 *
 * Enter animation uses CSS `@starting-style`, gated by `data-enter="animate"`.
 * Reduced motion is automatic: the attribute is not stamped when the user
 * prefers reduced motion.
 *
 * @example
 * <WhenVisible rootMargin="200px" className="transition-opacity data-[enter=animate]:starting:opacity-0">
 *   <HeavyChart />
 * </WhenVisible>
 */
export function WhenVisible({
  rootMargin = '200px',
  threshold,
  root,
  fallback,
  children,
  ref: forwardedRef,
  ...divProps
}: WhenVisibleProps): JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { phase } = useSight({
    ref: sentinelRef,
    observe: 'once',
    rootMargin,
    threshold,
    root,
  });

  const setRef = (node: HTMLDivElement | null): void => {
    sentinelRef.current = node;
    assignRef(forwardedRef, node);
  };

  if (phase !== 'visible') {
    return (
      <div ref={setRef} {...divProps}>
        {fallback}
      </div>
    );
  }

  const motionAllowed = !prefersReducedMotion();

  return (
    <div
      {...divProps}
      ref={setRef}
      data-phase="entered"
      data-enter={motionAllowed ? 'animate' : undefined}
    >
      {children}
    </div>
  );
}

function assignRef(
  ref: Ref<HTMLDivElement> | undefined,
  node: HTMLDivElement | null,
): void {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
