import { createRenderState, type RenderPhase } from '@usephase/core';
import { useState, type RefObject } from 'react';

import { useElementEffect } from '../_internal/use-element-effect';

export type { RenderPhase } from '@usephase/core';

/**
 * Track whether the browser is rendering an element or skipping it under
 * `content-visibility` (e.g. a `Defer` subtree). Returns `'rendered'` until the
 * browser reports otherwise.
 * Follows the element behind the ref across commits. When the element detaches
 * or observation restarts, the phase returns to `'rendered'` until the browser
 * reports another state.
 *
 * Use it to pause raw, non-phase work (a hand-written rAF loop, `setInterval`)
 * when the subtree stops painting. phase loops self-pause off-screen already.
 * Has no layout effect. Safe for CLS.
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

  useElementEffect(
    ref,
    (element) => {
      const render = createRenderState({
        target: element,
        onPhaseChange: setPhase,
      });

      return () => {
        render.stop();
        setPhase('rendered');
      };
    },
    [],
  );

  return phase;
}
