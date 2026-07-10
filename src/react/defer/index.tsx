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
// Types
// ---------------------------------------------------------------------------

export interface DeferProps extends Omit<HTMLAttributes<HTMLElement>, 'style'> {
  /**
   * HTML element to render. Default `'div'`. Use `'li'`, `'tr'`, or any
   * semantic element when a wrapper div would break document structure.
   */
  as?: ElementType;
  /**
   * Approximate size reserved before first paint (any CSS length, e.g. `'800px'`).
   * After the first render the browser remembers the real size. Default `'1000px'`.
   */
  estimatedHeight?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

// ---------------------------------------------------------------------------
// Defer
// ---------------------------------------------------------------------------

/**
 * Skip the browser's rendering work (style, layout, paint) for off-screen
 * content via `content-visibility: auto`. Pure CSS, no JS, no observer.
 *
 * Children stay in the DOM and are server-rendered (SEO- and CLS-safe).
 * `contain-intrinsic-size: auto <estimatedHeight>` reserves space so the
 * scrollbar does not jump. Defers rendering only, not hydration or mounting.
 *
 * The render-skip styles are encapsulated and cannot be overridden. There is
 * no `style` prop. Style the wrapper with `className`; this keeps the
 * no-layout-shift guarantee intact.
 *
 * @example
 * <Defer estimatedHeight="600px" className="my-section">
 *   <ArticleSection />
 * </Defer>
 *
 * @example
 * <Defer as="li" estimatedHeight="80px">
 *   <ListItemContent />
 * </Defer>
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
