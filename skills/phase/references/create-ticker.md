# `createTicker`

The low-level rAF clock underneath `createLoop`. Use when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

## Signature

```ts
import { createTicker } from 'phase';

const ticker = createTicker(options: TickerOptions): Ticker;
```

### Options

| Option   | Type                          | Default      | Description                                                     |
| -------- | ----------------------------- | ------------ | --------------------------------------------------------------- |
| `fps`    | `number`                      | — (uncapped) | Cap frame rate. Must be finite and > 0, or throws `invalid_fps` |
| `onTick` | `(frame: FrameState) => void` | required     | Called every frame                                              |
| `signal` | `AbortSignal`                 | —            | Stops the ticker when the signal is aborted                     |

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

- A defined `fps` (constructor or `setFps`) must be finite and > 0. Invalid values (`0`, negatives, `NaN`, `±Infinity`) throw `PhaseError` code `invalid_fps`. An invalid `setFps` leaves the previous cap unchanged.
- `setFps` works while idle, running, or paused. On a stopped ticker it throws `ticker_stopped` (that error takes precedence over fps validation).
- `setFps` never resets the timeline: `FrameState` identity, frame count, `elapsed`, start time, and pause accounting all continue. The new cap takes effect on the next eligible source frame, never as an uncapped transition frame.
- Capped delivery paces on a deadline grid: late rAF frames retain the residual, so an integer-quantized 60 Hz timestamp stream under a 60 fps cap delivers ~60 fps, not ~30. A cap at or above the display refresh rate delivers every source frame.

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

- Use `setFps()` to change the FPS cap on a live ticker. It keeps the timeline (frame count, elapsed, `FrameState` identity) instead of destroying and rebuilding.
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
