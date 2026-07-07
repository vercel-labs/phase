import type { ComponentProps, CSSProperties, JSX, Ref } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeferProps extends Omit<ComponentProps<'div'>, 'style'> {
  /**
   * Approximate size reserved before first paint (any CSS length, e.g. `'800px'`).
   * After the first render the browser remembers the real size. Default `'1000px'`.
   */
  estimatedHeight?: string;
  ref?: Ref<HTMLDivElement>;
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
 * @remarks
 * Animations inside a `Defer` keep running while paint is skipped. phase loops
 * self-pause off-screen on their own; for raw rAF/interval work, gate it with
 * `useRenderState`.
 */
export function Defer({
  estimatedHeight = '1000px',
  children,
  ref,
  ...divProps
}: DeferProps): JSX.Element {
  const deferStyle: CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: `auto ${estimatedHeight}`,
  };

  return (
    <div {...divProps} ref={ref} style={deferStyle}>
      {children}
    </div>
  );
}
