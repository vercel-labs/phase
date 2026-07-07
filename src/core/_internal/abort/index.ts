/**
 * Link an optional `AbortSignal` to a primitive's `stop`/cancel function.
 *
 * When the signal aborts, `stop` runs once. If the signal is already aborted,
 * `stop` runs synchronously. Returns an unlink function that removes the abort
 * listener. Call it from inside `stop` so a manual stop does not leave a
 * dangling listener on a long-lived controller.
 *
 * The listener is registered with `{ once: true }`, so abort and manual stop
 * are safe to interleave: whichever fires first wins, the other is a no-op.
 */
export function linkAbortSignal(
  signal: AbortSignal | undefined,
  stop: () => void,
): () => void {
  if (!signal) return unlinkNoop;
  if (signal.aborted) {
    stop();
    return unlinkNoop;
  }
  signal.addEventListener('abort', stop, { once: true });
  return () => signal.removeEventListener('abort', stop);
}

/** Shared empty unlink for the no-signal and already-aborted paths. */
function unlinkNoop(): void {
  // No listener was registered, so there is nothing to remove.
}
