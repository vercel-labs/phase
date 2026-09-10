import { linkAbortSignal } from '../_internal/abort';
import { noTargetError, serverContextError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RenderPhase = 'rendered' | 'skipped';

export interface RenderStateOptions {
  target: Element;
  onPhaseChange?: (phase: RenderPhase) => void;
  /** Abort signal that stops the observer when aborted. */
  signal?: AbortSignal;
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
 * event, the browser's ground-truth paint decision.
 *
 * Use it to pause raw, non-phase work (a hand-written rAF loop, `setInterval`,
 * expensive effects) when a `Defer` subtree stops painting. phase's own loops
 * already self-pause off-screen, so they do not need this.
 *
 * Listening and reacting has zero layout effect. It never breaks the
 * no-layout-shift guarantee of `content-visibility`.
 *
 * @example
 * const render = createRenderState({
 *   target: el,
 *   onPhaseChange: (phase) => phase === 'skipped' ? clock.pause() : clock.resume(),
 * });
 * // cleanup:
 * render.stop();
 *
 * @remarks
 * Where `content-visibility` is unsupported, `phase` stays `'rendered'`.
 *
 * Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements
 * inside a skipped `content-visibility: auto` subtree. Use this primitive to
 * detect that transition when your code depends on size observations resuming.
 */
export function createRenderState(options: RenderStateOptions): RenderState {
  if (typeof document === 'undefined') {
    serverContextError('createRenderState');
  }

  const { target: element, onPhaseChange, signal } = options;

  if (!element) noTargetError('createRenderState');

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

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    element.removeEventListener(
      'contentvisibilityautostatechange',
      onStateChange,
    );
  }

  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    get phase() {
      return _phase;
    },
    stop,
  };
}
