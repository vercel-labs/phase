# `createLoop`

The main primitive. Composes a ticker, visibility observer, reduced-motion listener, and quality signals into a lifecycle-aware animation loop.

## Signature

```ts
import { createLoop } from 'phase';

const loop = createLoop(options: LoopOptions): Loop;
```

### Options

| Option                | Type                                | Default      | Description                               |
| --------------------- | ----------------------------------- | ------------ | ----------------------------------------- |
| `element`             | `Element`                           | required     | Element to observe for visibility         |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called each frame while running           |
| `fps`                 | `number`                            | —            | Cap frames per second                     |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior when user prefers reduced motion |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades            |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode         |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to the underlying IO            |
| `start`               | `'auto' \| 'manual'`                | `'auto'`     | Whether to start immediately              |
| `onPhaseChange`       | `(phase, reason) => void`           | —            | Called on every phase transition          |
| `signal`              | `AbortSignal`                       | —            | Stops the loop when the signal is aborted |

### Return (Loop)

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `start()`       | `() => void`                  | Begin the loop (no-op if already running)      |
| `stop()`        | `() => void`                  | Terminal (disposes everything)                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- You need a per-frame animation loop that automatically pauses when off-screen or in a background tab.
- You want zero CPU when the element isn't visible (strong pause via `cancelAnimationFrame`).
- You need quality degradation signals (FPS throttle on window blur or frame budget overflow).
- You're animating DOM elements (transforms, opacity, positions) in a frame loop.

## When not to use

| Instead of this                                   | Use                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| You own the renderer (three.js, Pixi, Web Worker) | `createLifecycle` (gives you active/paused signal without driving the loop) |
| Single value into React render                    | `useTween` (smaller API surface, calls setState)                            |
| Pure CSS can do it                                | CSS `transition` / `animation` / `@starting-style`                          |
| Need springs or gesture-driven animation          | External library (motion, GSAP)                                             |
| React component                                   | `useLoop` (same engine with React lifecycle management)                     |

## Do

- Write to DOM directly inside `onTick`:
  ```ts
  onTick: (frame) => {
    el.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
  };
  ```
- Call `stop()` when the animation is permanently done (e.g. component unmounts, page navigates away).
- Read `phase` and `phaseReason` to debug unexpected pauses.
- Use `degraded: 'pause'` for heavy canvas/WebGL that can't gracefully degrade.

## Don't

- **Never call React `setState` inside `onTick`.** It fires 60 times/sec. Write to refs or DOM directly.
- **Never allocate inside `onTick`.** No objects, arrays, closures, template literals, or spreads. `FrameState` is mutated in place; reuse external variables.
- **Never store a reference to `frame`.** It's the same object every tick, mutated in place. Read values immediately.
- **Don't call `start()` after `stop()`.** `stop()` is terminal. Create a new loop instance.
- **Don't use `createLoop` without an element.** Throws `PhaseError` with code `no_element`.

## Reduced motion

Default: `'pause'`. The loop pauses entirely when reduced motion is enabled. The `phaseReason` will be `'reduced-motion'`.

- `'complete'`: Jump to the end state instantly (useful for tweens that have a target). The loop runs one final tick then stops.
- `'ignore'`: Keep running regardless. Use only for non-decorative motion (e.g. a data visualization that conveys information via movement).

## See also

- [createTicker](./create-ticker.md). The low-level rAF clock underneath createLoop; use when you don't need visibility management
- [createLifecycle](./create-lifecycle.md). The activation signal without the ticker; use when you own the render loop
- [useLoop](./use-loop.md). React hook wrapping createLoop with ref management
- [useCanvas](./use-canvas.md). React hook for canvas/WebGL with DPR handling on top of createLoop
- [abort-signals](./abort-signals.md). Stop this loop via the `signal` option
