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
- A cap change updates cadence and the stall bound together. It does not reset frame count, elapsed time, or the reused `FrameState` object.
- The cap holds its target rate on real browser timestamps: a 60fps cap on a 60Hz display delivers ~60fps even though timestamps are rounded. A cap at or above the display rate delivers every frame; delivery never exceeds the display rate.

### FrameState

| Field     | Type     | Description                                             |
| --------- | -------- | ------------------------------------------------------- |
| `time`    | `number` | Raw browser rAF timestamp                               |
| `delta`   | `number` | ms since the last delivered frame, with stall smoothing |
| `elapsed` | `number` | Running sum of delivered deltas                         |
| `frame`   | `number` | Frame count since start                                 |

`elapsed` and `delta` form one coherent timeline: each delivered frame sets `elapsed` to its previous value plus that frame's `delta`. The first delivered frame, and the first frame after `resume()`, use 16.67ms when uncapped or one active FPS interval when capped.

Stalls never make animations teleport. The maximum delivered `delta` is 40ms when uncapped or one active FPS interval plus 40ms when capped. Under repeated jank, this timeline can briefly run slower than wall clock. `time` is exempt and always exposes the raw browser timestamp for synchronization with non-phase rAF code.

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
- Rely on the shared clock: all tickers receive the same browser rAF timestamp, even when the same JavaScript global loads duplicate phase copies that use the same clock protocol.
- Use `frame.delta` and `frame.elapsed` for animation progress. Both follow the same stall-smoothed timeline and freeze during strong pause.

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
