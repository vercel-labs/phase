# `createLoop`

The main primitive. Composes a ticker, visibility observer, reduced-motion listener, and quality signals into a lifecycle-aware animation loop.

## Signature

```ts
import { createLoop } from 'phase';

const loop = createLoop(options: LoopOptions): Loop;
```

### Options

| Option                | Type                                | Default      | Description                                            |
| --------------------- | ----------------------------------- | ------------ | ------------------------------------------------------ |
| `target`              | `Element \| Document`               | required     | Element to observe, or `document` for the page         |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called each frame while running                        |
| `fps`                 | `number`                            | —            | Cap frames per second (finite, > 0)                    |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior when user prefers reduced motion              |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades                         |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode (finite, > 0)        |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to the underlying IO. Ignored for `document` |
| `start`               | `'auto' \| 'manual'`                | `'auto'`     | Whether to start immediately                           |
| `onPhaseChange`       | `(phase, reason) => void`           | —            | Called on every phase transition                       |
| `signal`              | `AbortSignal`                       | —            | Stops the loop when the signal is aborted              |

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
- You're animating DOM elements from live input or simulation state in a frame loop.

## When not to use

| Instead of this                                   | Use                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| You own the renderer (three.js, Pixi, Web Worker) | `createLifecycle` (gives you active/paused signal without driving the loop) |
| Single value into React render                    | `useTween` (smaller API surface, calls setState)                            |
| Browser-animatable timeline known at start        | CSS/WAAPI + `createLifecycle`                                               |
| Need springs or gesture-driven animation          | External library (motion, GSAP)                                             |
| React component                                   | `useLoop` (same engine with React lifecycle management)                     |

## Do

- Write to DOM directly inside `onTick`:
  ```ts
  let x = 0;
  onTick: (frame) => {
    x += velocity * frame.delta;
    el.style.transform = `translateX(${x}px)`;
  };
  ```
- Call `stop()` when the animation is permanently done (e.g. component unmounts, page navigates away).
- Read `phase` and `phaseReason` to debug unexpected pauses.
- Keep accumulating across quality changes: FPS throttling and recovery (e.g. the tab losing and regaining focus) never reset `frame.frame`, `frame.elapsed`, or swap out the `frame` object, so position and progress variables need no re-sync.
- Use `degraded: 'pause'` for heavy canvas/WebGL that can't gracefully degrade.

## Don't

- **Never write state that changes on every frame inside `onTick`.** React may re-render on every tick. Write repeated values to refs or the DOM. A one-time update is allowed only if the callback blocks repeats and stops the loop before returning.
- **Never allocate inside `onTick`.** No objects, arrays, closures, template literals, or spreads. `FrameState` is mutated in place; reuse external variables.
- **Never store a reference to `frame`.** It's the same object every tick, mutated in place. Read values immediately.
- **Don't call `start()` after `stop()`.** `stop()` is terminal. Create a new loop instance.
- **Don't use `createLoop` without an element.** Throws `PhaseError` with code `no_target`.
- **Don't pass a non-positive or non-finite `fps` or `degradedFps`.** Throws `PhaseError` with code `invalid_fps` at construction.

## Reduced motion

Default: `'pause'`. The loop pauses entirely when reduced motion is enabled. The `phaseReason` will be `'reduced-motion'`.

- `'complete'`: Jump to the end state instantly (useful for tweens that have a target). The loop runs one final tick then stops.
- `'ignore'`: Keep running. Use this when motion is essential, such as in a data visualization. It is also valid when surrounding code does not create the loop while reduced motion is on and shows the same information without motion.

## See also

- [createTicker](./create-ticker.md). The low-level rAF clock underneath createLoop; use when you don't need visibility management
- [createLifecycle](./create-lifecycle.md). The activation signal without the ticker; use when you own the render loop
- [useLoop](./use-loop.md). React hook wrapping createLoop with ref management
- [useCanvas](./use-canvas.md). React hook for canvas/WebGL with DPR handling on top of createLoop
- [abort-signals](./abort-signals.md). Stop this loop via the `signal` option
