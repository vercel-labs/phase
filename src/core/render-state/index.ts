import { noElementError, serverContextError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RenderPhase = 'rendered' | 'skipped';

export interface RenderStateOptions {
  element: Element;
  onPhaseChange?: (phase: RenderPhase) => void;
}

export interface RenderState {
  /** Whether the browser is currently rendering the element or skipping it. */
  readonly phase: RenderPhase;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createRenderState
// ---------------------------------------------------------------------------

/**
 * Report whether the browser is rendering an element or skipping it under
 * `content-visibility`. Listens to the `contentvisibilityautostatechange`
 * event — the browser's ground-truth paint decision.
 *
 * Use it to pause raw, non-phase work (a hand-written rAF loop, `setInterval`,
 * expensive effects) when a `Defer` subtree stops painting. phase's own loops
 * already self-pause off-screen, so they do not need this.
 *
 * Listening and reacting has zero layout effect — it never breaks the
 * no-layout-shift guarantee of `content-visibility`.
 *
 * @example
 * const render = createRenderState({
 *   element: el,
 *   onPhaseChange: (phase) => phase === 'skipped' ? clock.pause() : clock.resume(),
 * });
 * // cleanup:
 * render.stop();
 *
 * @remarks
 * Where `content-visibility` is unsupported, `phase` stays `'rendered'`.
 */
export function createRenderState(options: RenderStateOptions): RenderState {
  if (typeof document === 'undefined') {
    serverContextError('createRenderState');
  }

  const { element, onPhaseChange } = options;

  if (!element) noElementError('createRenderState');

  let _phase: RenderPhase = 'rendered';
  let stopped = false;

  function onStateChange(event: Event): void {
    if (stopped) return;
    const next: RenderPhase = (event as ContentVisibilityAutoStateChangeEvent)
      .skipped
      ? 'skipped'
      : 'rendered';
    if (next === _phase) return;
    _phase = next;
    onPhaseChange?.(_phase);
  }

  element.addEventListener('contentvisibilityautostatechange', onStateChange);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    element.removeEventListener(
      'contentvisibilityautostatechange',
      onStateChange,
    );
  }

  return {
    get phase() {
      return _phase;
    },
    stop,
  };
}
