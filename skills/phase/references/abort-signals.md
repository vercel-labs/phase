# Abort signals

Every core primitive that subscribes to something (`createTicker`, `createSight`, `createLifecycle`, `createLoop`, `createScrollProgress`, `createRenderState`, `createDevicePixelRatio`) and the one-shot `whenIdle` accept an optional `signal?: AbortSignal`. When the signal aborts, the primitive tears itself down exactly as if you had called its `stop()` (or the cancel function `whenIdle` returns).

This is purely additive. `stop()` and the cancel return value still work; `signal` is a second way to trigger the same teardown.

## When to use `signal` vs `stop()`

| Situation                                                                | Use      |
| ------------------------------------------------------------------------ | -------- |
| One controller tears down several primitives from a single cleanup path  | `signal` |
| You already hold the instance and want to stop just that one             | `stop()` |
| A parent already exposes an `AbortSignal` (fetch, event handler, effect) | `signal` |
| Composing with `AbortSignal.timeout()` or `AbortSignal.any([...])`       | `signal` |

The win is collapsing many teardown calls into one `controller.abort()`. For a single primitive you already have a handle to, `stop()` is simpler.

## Semantics

- **Abort runs teardown once.** After the signal aborts, the primitive is stopped; further aborts and a manual `stop()` are no-ops.
- **Already-aborted signal.** If the signal is aborted before you pass it, the primitive never subscribes (or stops immediately). No dangling observers.
- **Manual `stop()` unlinks the listener.** Stopping by hand removes the abort listener, so a long-lived controller never retains a reference to a stopped primitive.

## Do

- Drive several primitives from one controller and abort them together:

  ```ts
  const controller = new AbortController();
  const { signal } = controller;

  createSight({ target, onPhaseChange, signal });
  createDevicePixelRatio({ onChange: scheduleResize, signal });
  const loop = createLoop({ target, onTick, signal });

  // one teardown for all three:
  return () => controller.abort();
  ```

- Reuse a signal you already have (e.g. from a parent effect or a fetch) instead of threading `stop()` calls through your own cleanup.

## Don't

- **Don't return the method reference directly.** `controller.abort` loses its `this` and throws `Illegal invocation`. Wrap it:
  ```ts
  return () => controller.abort(); // correct
  return controller.abort; // wrong — detached, throws when called
  ```
- **Don't pass `signal` to React hooks.** The hooks (`useLoop`, `useSight`, …) already tear down in their `useEffect` cleanup. `signal` is a core-primitive concern.
- **Don't reuse an aborted controller.** Once aborted it stays aborted; create a fresh `AbortController` for a new lifecycle.

## See also

- [create-loop.md](./create-loop.md), [create-lifecycle.md](./create-lifecycle.md), [create-ticker.md](./create-ticker.md), [create-sight.md](./create-sight.md). Primitives that accept `signal`
- [when-idle.md](./when-idle.md). `whenIdle` cancels the scheduled callback on abort
