# `useDebouncedCallback`

React hook wrapping `createDebounce`. Returns a stable-identity debounced function that drops into any callback slot: the latest value fires once `wait` ms pass without a new call, and no timer runs while the document is hidden. Tears down on unmount.

## Signature

```ts
import { useDebouncedCallback } from 'phase/react';

const debounced = useDebouncedCallback<T>(callback, options);
debounced(value);
debounced.flush();
debounced.cancel();
```

### Options

| Option   | Type                | Default   | Description                                 |
| -------- | ------------------- | --------- | ------------------------------------------- |
| `wait`   | `number`            | required  | Quiet period in ms; each call restarts it   |
| `hidden` | `'flush' \| 'drop'` | `'flush'` | Pending-call policy when the document hides |

### Return (DebouncedFunction)

A callable with stable identity across renders, safe in deps arrays and as a prop.

| Property   | Type                 | Description                                 |
| ---------- | -------------------- | ------------------------------------------- |
| `(value)`  | `(value: T) => void` | Record `value` and restart the quiet timer  |
| `flush()`  | `() => void`         | Invoke a pending call now (no-op when idle) |
| `cancel()` | `() => void`         | Discard a pending call                      |

The latest `callback` identity is always invoked; changing it never restarts the debounce. Unmount discards a pending call. Changing `wait` or `hidden` recreates the debounce and also drops pending work. There is no `enabled` option: a disabled debounce is one you do not call.

## When to use

- Canvas or WebGL buffer reallocation after a resize stream settles.
- Persisting or querying after input stops (autosave, search-as-you-type).
- Any expensive one-shot that should wait out a burst instead of running during it.

## When not to use

| Instead of this                                      | Use                     |
| ---------------------------------------------------- | ----------------------- |
| Work that must run during the burst at a fixed floor | `useThrottledCallback`  |
| lodash `maxWait` semantics                           | `useThrottledCallback`  |
| Reacting to the resize itself (cheap DOM writes)     | `useSize` alone         |
| Framework-agnostic code                              | `createDebounce` (core) |

## Do

- Debounce buffer reallocation behind `useSize`, two statements, no nesting:
  ```tsx
  const realloc = useDebouncedCallback(
    (size: Size) => reallocateBuffers(size),
    { wait: 250 },
  );
  const { ref } = useSize({ onResize: realloc });
  return <canvas ref={ref} />;
  ```
- Flush in your own cleanup when the final value must land:
  ```tsx
  useEffect(() => () => save.flush(), [save]);
  ```

## Don't

- **Don't use it where a steady stream never goes quiet.** The callback would be postponed indefinitely; use `useThrottledCallback` for a rate floor.
- **Don't debounce `onTick`/`draw`.** Frame loops are rate-controlled by `fps`.
- **Don't expect calls while hidden to fire.** The quiet timer restarts when the document is visible again (see [createDebounce](./create-debounce.md) for the full visibility model).

## Reduced motion

Not applicable. The hook schedules callbacks, not animation.

## See also

- [createDebounce](./create-debounce.md). Framework-agnostic core and the visibility model
- [useThrottledCallback](./use-throttled-callback.md). Rate floor during the burst, plus the tool-choosing table
- [useSize](./use-size.md). The usual source for debounced resize work
- [useCanvas](./use-canvas.md). Handles its own resize/DPR sizing; pair a debounce only for extra consumer-owned buffers
