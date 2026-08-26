# `createTicker`

The low-level rAF clock underneath `createLoop`. Use when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

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

### FPS cap semantics

- `fps` must be a finite number greater than 0, both at construction and in `setFps`. Anything else throws `invalid_fps`; a failed `setFps` keeps the previous cap.
- `setFps` works while idle, running, or paused, and never restarts the timeline: `FrameState` identity, frame count, `elapsed`, and pause accounting all continue. On a stopped ticker it throws `ticker_stopped`, even when the fps is also invalid.
- A new cap applies from the next frame, and never sooner than the new interval allows.
- The cap holds its target rate on real browser timestamps: a 60fps cap on a 60Hz display delivers ~60fps even though timestamps are rounded. A cap at or above the display rate delivers every frame; delivery never exceeds the display rate.

### FrameState

| Field     | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `time`    | `number` | Current browser rAF timestamp            |
| `delta`   | `number` | ms since last tick (clamped to 40ms max) |
| `elapsed` | `number` | ms since start, excluding paused time    |
| `frame`   | `number` | Frame count since start                  |

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
- Rely on the shared clock: all tickers receive the same browser rAF timestamp, so multiple animations stay in sync.
- Trust delta clamping: after a long pause, `frame.delta` is clamped to 40ms. No teleporting.

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
