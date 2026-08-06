# `createThrottle`

Frame-aligned, visibility-aware throttle for event-driven work below frame rate. Leading calls fire synchronously; a pending trailing call fires with the latest value on the first animation frame at or past `interval`. Schedules nothing while idle or while the document is hidden. The framework-agnostic core behind `useThrottledCallback`.

## Signature

```ts
import { createThrottle } from 'phase';

const throttle = createThrottle<T>(options: ThrottleOptions<T>): Throttle<T>;
```

### Options

| Option     | Type                 | Default   | Description                                   |
| ---------- | -------------------- | --------- | --------------------------------------------- |
| `callback` | `(value: T) => void` | required  | Called with the latest value passed to `call` |
| `interval` | `number`             | required  | Minimum ms between invocations                |
| `edge`     | `ThrottleEdge`       | `'both'`  | `'leading' \| 'trailing' \| 'both'`           |
| `hidden`   | `'flush' \| 'drop'`  | `'flush'` | Pending-call policy when the document hides   |
| `signal`   | `AbortSignal`        | --        | Stops the throttle when aborted               |

### Return (Throttle)

| Property   | Type                 | Description                                           |
| ---------- | -------------------- | ----------------------------------------------------- |
| `call`     | `(value: T) => void` | Record `value` and fire per the edge rules            |
| `flush()`  | `() => void`         | Invoke a pending trailing call now (no-op when idle)  |
| `cancel()` | `() => void`         | Discard a pending call and reset the interval window  |
| `pending`  | `boolean`            | Whether a trailing call is waiting (synchronous read) |
| `stop()`   | `() => void`         | Terminal. Discards pending work and removes listeners |

### Timing model

- Leading calls fire synchronously inside `call` (zero latency).
- Trailing calls ride a one-shot rAF chain and fire on the first frame where `interval` has elapsed since the last invocation, so the effective interval quantizes up to frame boundaries (`interval: 50` on a 60 Hz display fires every 3-4 frames).
- No rAF is scheduled while nothing is pending. The primitive is event-driven: zero work when the trigger is idle, unlike a polling loop.

### Visibility model

Document-level (`visibilitychange` + bfcache `pageshow`). On hide, a pending call is flushed or dropped per `hidden`. While hidden, `call` records the latest value but fires nothing, not even the leading edge; the pending call fires on the first frame after the document is visible again. There is no element gate: element-bound event sources (`createPointer`, `createScroll`, `createMutation`) already pause off-screen upstream, so gating here would be redundant.

## When to use

- Rate-limiting event-driven work below frame rate: socket emits, `worker.postMessage`, expensive geometry recompute.
- Any callback where per-frame batching (one rAF coalesce) is not enough and you need a floor of N ms between invocations.
- Replacing a lodash-style `throttle(fn, ms)` whose timer keeps firing in background tabs or drops the final value.

## When not to use

| Instead of this                                  | Use                                          |
| ------------------------------------------------ | -------------------------------------------- |
| Capping a continuous render loop's rate          | `createLoop({ fps })`                        |
| Fire once after a burst settles (resize, typing) | `createDebounce`                             |
| Coalescing to once per frame (no ms floor)       | `createPointer` / `createScroll` already do  |
| Very long intervals (1s+) on sparse triggers     | `createDebounce` or `createLoop({ fps: 1 })` |
| React component                                  | `useThrottledCallback`                       |

## Do

- Pass one value per call and let trailing coalescing keep the latest:
  ```ts
  const throttle = createThrottle<PointerState>({
    callback: (s) => socket.emit('cursor', s.x, s.y),
    interval: 50,
  });
  pointer = createPointer({ element, onPointer: throttle.call });
  // cleanup:
  throttle.stop();
  ```
- Use `edge: 'trailing'` when only the settled value matters and immediate feedback does not.
- Use `hidden: 'drop'` when the pending work is purely visual and stale on return.

## Don't

- **Don't pass multi-argument callbacks.** `call` takes exactly one value so the hot path never allocates a rest-args array. Wrap extras in an object outside the hot path, or close over them.
- **Don't store a snapshot expectation.** Phase state objects are mutated in place, so a trailing call reads the values current at fire time. That is the point: the trailing edge always delivers the freshest state.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.
- **Don't use it to slow a render loop.** That is `fps` on `createLoop`; this primitive fires on triggers, not frames.

## Reduced motion

Not applicable. `createThrottle` schedules callbacks, not animation. Gate any motion inside the callback with the usual reduced-motion handling.

## See also

- [useThrottledCallback](./use-throttled-callback.md). React hook wrapping this core, with the poll-vs-event decision table
- [createDebounce](./create-debounce.md). Fire after quiet instead of at a rate floor
- [createPointer](./create-pointer.md) / [createScroll](./create-scroll.md). Event sources that pair with it
- [abort-signals](./abort-signals.md). Tear down via the `signal` option
