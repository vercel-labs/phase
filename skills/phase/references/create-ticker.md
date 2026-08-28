# `createTicker`

The low-level rAF clock underneath `createLoop`. Use when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

Event-derived work queued before frame dispatch begins is flushed before any frame-loop callback in that frame. Work queued during input or tick dispatch runs in the next frame.

## Signature

```ts
import { createTicker } from 'phase';

const ticker = createTicker(options: TickerOptions): Ticker;
```

### Options

| Option   | Type                          | Default      | Description                                 |
| -------- | ----------------------------- | ------------ | ------------------------------------------- |
| `fps`    | `number`                      | — (uncapped) | Cap frame rate (finite, > 0)                |
| `onTick` | `(frame: FrameState) => void` | required     | Called every frame                          |
| `signal` | `AbortSignal`                 | —            | Stops the ticker when the signal is aborted |

### Return (Ticker)

| Property       | Type                     | Description                                                     |
| -------------- | ------------------------ | --------------------------------------------------------------- |
| `start()`      | `() => void`             | Begin ticking                                                   |
| `stop()`       | `() => void`             | Terminal (cannot restart)                                       |
| `pause()`      | `() => void`             | Strong pause (cancels rAF subscription)                         |
| `resume()`     | `() => void`             | Resume from pause                                               |
| `setFps(fps?)` | `(fps?: number) => void` | Change the FPS cap in place; `undefined` uncaps                 |
| `phase`        | `TickerPhase`            | `'idle' \| 'running' \| 'paused' \| 'stopped'`                  |
| `phaseReason`  | `TickerReason`           | `'initial' \| 'started' \| 'resumed' \| 'manual' \| 'disposed'` |

### FPS limit behavior

- `fps` must be a finite number greater than 0, both at construction and in `setFps`. Anything else throws `invalid_fps`; a failed `setFps` keeps the previous cap.
- `setFps` works while idle, running, or paused. It keeps the reused `FrameState`, frame count, elapsed time, and current phase. On a stopped ticker it throws `ticker_stopped`, even when the fps is also invalid.
- A new limit applies to the next eligible browser frame. That callback cannot run sooner than the new interval allows.
- Changing the limit also changes the largest `delta` a delayed callback may report. It does not reset frame count or elapsed time.
- On a 60Hz display, a 60fps limit delivers about 60 callbacks per second even when browser timestamps are rounded. A limit at or above the display rate delivers every browser frame.

### FrameState

| Field     | Type     | Description                               |
| --------- | -------- | ----------------------------------------- |
| `time`    | `number` | Browser `requestAnimationFrame` timestamp |
| `delta`   | `number` | Milliseconds to advance this frame        |
| `elapsed` | `number` | Sum of all delivered deltas               |
| `frame`   | `number` | Number of callbacks delivered since start |

Each callback sets `elapsed` to its previous value plus that callback's `delta`. The first callback after `start()` or `resume()` uses 16.67ms without an FPS limit, or one configured interval with a limit.

After a delayed callback, `delta` is at most 40ms without an FPS limit, or one configured interval plus 40ms with a limit. Repeated delays can make the animation advance more slowly than real time. `time` always exposes the browser's unmodified timestamp so non-phase animation code can use the same source time.

## When to use

- You need a frame loop that does NOT depend on element visibility (audio timing, physics simulation, background computation).
- You want FPS capping with a shared clock.
- You're building a custom animation system on top of phase's clock infrastructure.

## When not to use

| Instead of this                 | Use                                                  |
| ------------------------------- | ---------------------------------------------------- |
| Animation tied to a DOM element | `createLoop` (adds visibility pausing automatically) |
| React component                 | `useLoop` (manages refs and teardown)                |
| Single numeric tween            | `useTween`                                           |

## Do

- Use `setFps()` to change the FPS cap on a live ticker instead of destroying and rebuilding it.
- Use `pause()` / `resume()` for intentional suspension (e.g. user pauses a game).
- Rely on the shared clock: ticker instances within one JavaScript global, such as a page or worker, receive the same browser `requestAnimationFrame` timestamp. This includes instances from separately bundled copies of phase.
- Use `frame.delta` and `frame.elapsed` for animation progress. Elapsed time advances by the delivered delta and does not advance while paused.

## Don't

- **Never call `start()`, `resume()`, or `setFps()` on a stopped ticker.** Throws `PhaseError` with code `ticker_stopped`. Create a new instance.
- **Never store a reference to `frame`.** Same object every tick, mutated in place.
- **Never allocate inside `onTick`.** Zero-allocation contract applies here too.
- **Don't use `createTicker` for DOM animations.** Without visibility management, your loop keeps burning CPU when off-screen. Use `createLoop`.

## Reduced motion

`createTicker` does NOT handle reduced motion. It has no element or visibility concept. If you need reduced-motion awareness, use `createLoop` or `createLifecycle` instead.

## See also

- [createLoop](./create-loop.md). Builds on createTicker with visibility + reduced motion + quality signals
- [useLoop](./use-loop.md). React hook wrapping createLoop
- [abort-signals](./abort-signals.md). Stop this ticker via the `signal` option
