# `createDebounce`

Visibility-aware trailing debounce: fires the callback with the latest value once `wait` ms pass without a new call. No timer runs while the document is hidden. The framework-agnostic core behind `useDebouncedCallback`.

## Signature

```ts
import { createDebounce } from 'phase';

const debounce = createDebounce<T>(options: DebounceOptions<T>): Debounce<T>;
```

### Options

| Option     | Type                 | Default   | Description                                   |
| ---------- | -------------------- | --------- | --------------------------------------------- |
| `callback` | `(value: T) => void` | required  | Called with the latest value passed to `call` |
| `wait`     | `number`             | required  | Quiet period in ms; each call restarts it     |
| `hidden`   | `'flush' \| 'drop'`  | `'flush'` | Pending-call policy when the document hides   |
| `signal`   | `AbortSignal`        | --        | Stops the debounce when aborted               |

### Return (Debounce)

| Property   | Type                 | Description                                            |
| ---------- | -------------------- | ------------------------------------------------------ |
| `call`     | `(value: T) => void` | Record `value` and restart the quiet timer             |
| `flush()`  | `() => void`         | Invoke a pending call now (no-op when idle)            |
| `cancel()` | `() => void`         | Discard a pending call                                 |
| `pending`  | `boolean`            | Whether a call is waiting for quiet (synchronous read) |
| `stop()`   | `() => void`         | Terminal. Discards pending work and removes listeners  |

### Visibility model

Document-level (`visibilitychange` + bfcache `pageshow`). On hide, the timer is cleared and a pending call is flushed or dropped per `hidden`. Calls made while hidden record the latest value but start no timer; the quiet period restarts when the document is visible again. Naked `setTimeout` debounces get this wrong: background tabs clamp timers to 1s+ and fire them anyway.

## When to use

- Run once after a burst settles: canvas or WebGL buffer reallocation after a resize stream ends, search queries after typing stops.
- Trailing debounce is always trailing here: the callback fires after quiet, never on the first call.

## When not to use

| Instead of this                                       | Use                    |
| ----------------------------------------------------- | ---------------------- |
| A floor of N ms between invocations during the burst  | `createThrottle`       |
| lodash `maxWait` semantics (guaranteed periodic fire) | `createThrottle`       |
| Reacting to element resize itself                     | `useSize` (the source) |
| React component                                       | `useDebouncedCallback` |

## Do

- Debounce expensive reallocation behind a resize stream:
  ```ts
  const debounce = createDebounce<Size>({
    callback: (size) => reallocateBuffers(size),
    wait: 250,
  });
  // feed it from your resize source, e.g. a ResizeObserver callback
  debounce.call({ width, height });
  // cleanup:
  debounce.stop();
  ```
- Use `hidden: 'drop'` when the pending work would be recomputed on return anyway.

## Don't

- **Don't use it as a rate limiter.** A steady event stream postpones the callback forever. If work must run during the burst, use `createThrottle`.
- **Don't pass multi-argument callbacks.** `call` takes exactly one value; wrap extras in an object.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.

## Reduced motion

Not applicable. `createDebounce` schedules callbacks, not animation. Gate any motion inside the callback with the usual reduced-motion handling.

## See also

- [useDebouncedCallback](./use-debounced-callback.md). React hook wrapping this core
- [createThrottle](./create-throttle.md). Rate floor during the burst instead of after it
- [use-size](./use-size.md). The usual source for debounced resize work
- [abort-signals](./abort-signals.md). Tear down via the `signal` option
