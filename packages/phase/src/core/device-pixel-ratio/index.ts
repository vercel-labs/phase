import { linkAbortSignal } from '../_internal/abort';
import { serverContextError } from '../_internal/errors';
import { subscribeDpr, readDpr } from '../_internal/pool/dpr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevicePixelRatioOptions {
  /** Called when devicePixelRatio changes (e.g. window moved between monitors). */
  onChange: (dpr: number) => void;
  /** Abort signal that stops the watcher when aborted. */
  signal?: AbortSignal;
}

export interface DevicePixelRatio {
  /** Current devicePixelRatio. Synchronous read of the last-reported value. */
  readonly dpr: number;
  stop(): void;
}

// ---------------------------------------------------------------------------
// createDevicePixelRatio
// ---------------------------------------------------------------------------

/**
 * Track devicePixelRatio changes (e.g. user drags the window between monitors
 * with different pixel densities).
 *
 * Uses a shared `matchMedia` subscription that re-subscribes on every change,
 * so chained monitor switches (A -> B -> C) are all caught. Multiple instances
 * share one underlying subscription.
 *
 * @example
 * const watcher = createDevicePixelRatio({
 *   onChange: (dpr) => bridge.setDpr(dpr),
 * });
 * watcher.dpr;   // current value
 * // cleanup:
 * watcher.stop();
 */
export function createDevicePixelRatio(
  options: DevicePixelRatioOptions,
): DevicePixelRatio {
  if (typeof matchMedia === 'undefined') {
    serverContextError('createDevicePixelRatio');
  }

  const { onChange, signal } = options;

  let _dpr: number = readDpr();
  let stopped = false;

  const unsubscribe: () => void = subscribeDpr((dpr) => {
    _dpr = dpr;
    onChange(dpr);
  });

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    unsubscribe();
  }

  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    get dpr(): number {
      return _dpr;
    },
    stop,
  };
}
