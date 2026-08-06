# `useThrottledCallback`

React hook wrapping `createThrottle`. Returns a stable-identity throttled function that drops into any callback slot: leading calls fire synchronously, trailing calls fire frame-aligned with the latest value, and nothing runs while the document is hidden. Tears down on unmount.

## Signature

```ts
import { useThrottledCallback } from 'phase/react';

const throttled = useThrottledCallback<T>(callback, options);
throttled(value);
throttled.flush();
throttled.cancel();
```

### Arguments

| Argument   | Type                          | Description                                       |
| ---------- | ----------------------------- | ------------------------------------------------- |
| `callback` | `(value: T) => void`          | The function to throttle; latest identity is used |
| `options`  | `UseThrottledCallbackOptions` | See below                                         |

### Options

| Option     | Type                | Default   | Description                                 |
| ---------- | ------------------- | --------- | ------------------------------------------- |
| `interval` | `number`            | required  | Minimum ms between invocations              |
| `edge`     | `ThrottleEdge`      | `'both'`  | `'leading' \| 'trailing' \| 'both'`         |
| `hidden`   | `'flush' \| 'drop'` | `'flush'` | Pending-call policy when the document hides |

### Return (ThrottledFunction)

A callable with stable identity across renders, safe in deps arrays and as a prop.

| Property   | Type                 | Description                                          |
| ---------- | -------------------- | ---------------------------------------------------- |
| `(value)`  | `(value: T) => void` | Record `value` and fire per the edge rules           |
| `flush()`  | `() => void`         | Invoke a pending trailing call now (no-op when idle) |
| `cancel()` | `() => void`         | Discard a pending trailing call and reset the window |

Unmount discards a pending call. Changing `interval`, `edge`, or `hidden` recreates the throttle and also drops pending work. There is no `enabled` option: a disabled throttle is one you do not call.

## Choosing a rate-limiting tool

Three tools cap work below the display rate. Pick by how the work is driven:

| Situation                                                            | Use                           | Why                                                             |
| -------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| A continuous render loop should run slower                           | `useLoop({ fps })`            | Caps the loop itself                                            |
| Sample an always-fresh value (`stateRef`) at a low rate              | `useLoop({ fps }) + stateRef` | Polls every tick while visible; wins when every tick has work   |
| Event-driven work that should fire on the trigger and idle otherwise | `useThrottledCallback`        | Zero scheduled work between events; sink need not be DOM/frames |
| Run once after a burst settles                                       | `useDebouncedCallback`        | Fires after quiet, not during the burst                         |

The polling pattern samples even when the source is idle (a `fps: 10` loop does 10 checks/sec while visible, moving pointer or not). The throttled callback fires only when events arrive and schedules nothing otherwise, which suits sparse triggers and non-frame sinks like sockets and workers.

## When to use

- Pointer position to multiplayer socket emits at a fixed rate.
- Main-thread to Web Worker messaging that should not flood the channel.
- Expensive recompute (geometry, layout math) triggered by high-frequency events.

## When not to use

| Instead of this                            | Use                                         |
| ------------------------------------------ | ------------------------------------------- |
| Capping a `useLoop`/`useCanvas` frame rate | The `fps` option                            |
| Fire after the burst ends                  | `useDebouncedCallback`                      |
| Once-per-frame coalescing (no ms floor)    | `usePointer`/`useScroll` already deliver it |
| Framework-agnostic code                    | `createThrottle` (core)                     |

## Do

- Throttle pointer-to-socket emits, two statements, no nesting:
  ```tsx
  const emit = useThrottledCallback(
    (s: PointerState) => socket.emit('cursor', { x: s.x, y: s.y }),
    { interval: 50 },
  );
  const { ref } = usePointer({ onPointer: emit });
  return <div ref={ref} />;
  ```
- Throttle worker messaging from any event source:
  ```tsx
  const post = useThrottledCallback(
    (input: SimInput) => worker.postMessage(input),
    { interval: 100 },
  );
  ```
- Think in rates? `interval: 1000 / 20` reads as "at most 20 per second". `interval` is a spacing floor between event-driven fires, not a loop rate; a loop that should run at 20 fps is `useLoop({ fps: 20 })`.
- Flush the final value in your own cleanup when it matters:
  ```tsx
  useEffect(() => () => emit.flush(), [emit]);
  ```
- Cleanup is otherwise automatic: unmount stops the throttle and drops pending work.

## Don't

- **Don't wrap `onTick`/`draw` with it.** Frame loops are already rate-controlled by `fps`; throttling inside a frame loop double-schedules.
- **Don't recreate the wrapped callback's dependencies per call.** The hook always invokes the latest `callback`, so read fresh props and refs inside it instead of re-keying options.
- **Don't expect calls while hidden to fire.** They are recorded and delivered once the document is visible again (see [createThrottle](./create-throttle.md) for the full visibility model).

## Reduced motion

Not applicable. The hook schedules callbacks, not animation.

## See also

- [createThrottle](./create-throttle.md). Framework-agnostic core and the timing/visibility model
- [useDebouncedCallback](./use-debounced-callback.md). Fire after quiet instead of at a rate floor
- [usePointer](./use-pointer.md) / [useScroll](./use-scroll.md). Event sources that pair with it
- [useLoop](./use-loop.md). The polling alternative for always-active sampling
