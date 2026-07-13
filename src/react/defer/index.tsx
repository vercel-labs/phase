import {
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DeferProps extends Omit<HTMLAttributes<HTMLElement>, 'style'> {
  /**
   * HTML element to render. Default `'div'`. Use `'li'`, `'tr'`, or any
   * semantic element when a wrapper div would break document structure.
   */
  as?: ElementType;
  /**
   * Approximate size reserved before first paint (any CSS length).
   * After first render the browser remembers the real size. Default `'1000px'`.
   */
  estimatedHeight?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

// ---------------------------------------------------------------------------
// Defer
// ---------------------------------------------------------------------------

/**
 * Skip browser rendering (style, layout, paint) for off-screen content via
 * `content-visibility: auto`. Pure CSS, no JS, no observer. Children stay
 * in the DOM and are server-rendered (SEO- and CLS-safe).
 */
export function Defer({
  as: Component = 'div',
  estimatedHeight = '1000px',
  children,
  ref,
  ...rest
}: DeferProps): JSX.Element {
  const deferStyle: CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: `auto ${estimatedHeight}`,
  };

  return createElement(
    Component,
    { ...rest, ref, style: deferStyle },
    children,
  );
}
