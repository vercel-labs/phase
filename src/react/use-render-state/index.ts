import { useState, useEffect, type RefObject } from 'react';

import { createRenderState, type RenderPhase } from '../../core/render-state';

export type { RenderPhase } from '../../core/render-state';

/**
 * Track whether the browser is rendering an element or skipping it under
 * `content-visibility` (e.g. a `Defer` subtree). Returns `'rendered'` until the
 * browser reports otherwise.
 *
 * Use it to pause raw, non-phase work (a hand-written rAF loop, `setInterval`)
 * when the subtree stops painting. phase loops self-pause off-screen already.
 * Has no layout effect — safe for CLS.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * const phase = useRenderState(ref);
 * useEffect(() => {
 *   if (phase === 'skipped') clock.pause();
 *   else clock.resume();
 * }, [phase]);
 * return <Defer ref={ref}><Heavy /></Defer>;
 */
export function useRenderState<T extends Element = HTMLDivElement>(
  ref: RefObject<T | null>,
): RenderPhase {
  const [phase, setPhase] = useState<RenderPhase>('rendered');

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const render = createRenderState({
      element,
      onPhaseChange: setPhase,
    });

    return () => render.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return phase;
}
