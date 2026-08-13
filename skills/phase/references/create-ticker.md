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
| `fps`    | `number`                      | — (uncapped) | Finite positive average frame-rate cap      |
| `onTick` | `(frame: FrameState) => void` | required     | Called every frame                          |
| `signal` | `AbortSignal`                 | —            | Stops the ticker when the signal is aborted |

### Return (Ticker)

| Property       | Type                     | Description                                                     |
| -------------- | ------------------------ | --------------------------------------------------------------- |
| `start()`      | `() => void`             | Begin ticking                                                   |
| `stop()`       | `() => void`             | Terminal (cannot restart)                                       |
| `pause()`      | `() => void`             | Strong pause (cancels rAF subscription)                         |
| `resume()`     | `() => void`             | Resume from pause                                               |
| `setFps(fps?)` | `(fps?: number) => void` | Change the FPS cap in place; `undefined` uncaps (mirrors `fps`) |
| `phase`        | `TickerPhase`            | `'idle' \| 'running' \| 'paused' \| 'stopped'`                  |
| `phaseReason`  | `TickerReason`           | `'initial' \| 'started' \| 'resumed' \| 'manual' \| 'disposed'` |

### FrameState

| Field     | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `time`    | `number` | Shared browser rAF timestamp             |
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

- Use `pause()` / `resume()` for intentional suspension (e.g. user pauses a game).
- Use `setFps()` to change speed mid-run: only the deadline gate changes, so `elapsed`, `delta`, the frame count, and `FrameState` identity stay continuous. `setFps(undefined)` removes the cap.
- Rely on the shared clock: all tickers receive the same browser rAF timestamp. Subscribers started or resumed during dispatch wait for the next browser frame.
- The first frame after start/resume is immediate. Deadline residual is carried forward so a 30fps cap does not drift toward 20fps on a 60Hz source.
- Trust delta clamping: after a long pause, `frame.delta` is clamped to 40ms. No teleporting.

## Don't

- **Never call `start()`, `resume()`, or `setFps()` on a stopped ticker.** Throws `PhaseError` with code `ticker_stopped`. Create a new instance.
- **Never pass zero, negative, non-finite, or `NaN` FPS.** Only `undefined` means uncapped; invalid values throw `invalid_fps`.
- **Never store a reference to `frame`.** Same object every tick, mutated in place.
- **Never mutate `frame`.** Its fields are readonly, and internal counters do not trust consumer mutation.
- **Never allocate inside `onTick`.** Zero-allocation contract applies here too.
- **Don't use `createTicker` for DOM animations.** Without visibility management, your loop keeps burning CPU when off-screen. Use `createLoop`.

## Reduced motion

`createTicker` does NOT handle reduced motion. It has no element or visibility concept. If you need reduced-motion awareness, use `createLoop` or `createLifecycle` instead.

## See also

- [createLoop](./create-loop.md). Builds on createTicker with visibility + reduced motion + quality signals
- [useLoop](./use-loop.md). React hook wrapping createLoop
- [abort-signals](./abort-signals.md). Stop this ticker via the `signal` option
