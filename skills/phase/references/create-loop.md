# `createLoop`

The main primitive. Composes a ticker, visibility observer, reduced-motion listener, and quality signals into a lifecycle-aware animation loop.

## Signature

```ts
import { createLoop } from 'phase';

const loop = createLoop(options: LoopOptions): Loop;
```

### Options

| Option                | Type                                | Default      | Description                                               |
| --------------------- | ----------------------------------- | ------------ | --------------------------------------------------------- |
| `element`             | `Element`                           | required     | Element to observe for visibility                         |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called each frame while running                           |
| `fps`                 | `number`                            | none         | Base FPS cap; uncapped uses display refresh               |
| `reducedMotion`       | `'pause' \| 'ignore'`               | `'pause'`    | Behavior when user prefers reduced motion                 |
| `unfocused`           | `'pause' \| 'throttle' \| 'ignore'` | `'pause'`    | Behavior while the window is unfocused                    |
| `frameBudget`         | `'pause' \| 'throttle' \| 'ignore'` | `'throttle'` | Behavior after 3 frames exceed 1.5x the target interval   |
| `throttleFps`         | `number`                            | `30`         | Shared throttle cap; never raises a lower `fps`           |
| `intersectionOptions` | `IntersectionObserverInit`          | none         | Forwarded to the underlying IO                            |
| `start`               | `'auto' \| 'manual'`                | `'auto'`     | Whether to start immediately                              |
| `onPhaseChange`       | `(phase, reason) => void`           | none         | Called on every phase transition                          |
| `onQualityChange`     | `QualityChangeCallback`             | none         | Called when quality, reason, or resolved behavior changes |
| `signal`              | `AbortSignal`                       | none         | Stops the loop when the signal is aborted                 |

### Return (Loop)

| Property          | Type                            | Description                                                                                      |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `start()`         | `() => void`                    | Begin the loop (no-op if already running)                                                        |
| `stop()`          | `() => void`                    | Terminal (disposes everything)                                                                   |
| `phase`           | `LoopPhase`                     | `'idle' \| 'running' \| 'paused' \| 'stopped'`                                                   |
| `phaseReason`     | `LoopReason`                    | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'degraded' \| 'disposed'` |
| `quality`         | `Quality`                       | Signal state, independent of configured behavior                                                 |
| `qualityReason`   | `DegradedReason \| undefined`   | `'unfocused' \| 'frame-budget'`; unfocused reports first when both are active                    |
| `qualityBehavior` | `DegradedBehavior \| undefined` | Resolved behavior after `pause` > `throttle` > `ignore` precedence                               |

## When to use

- You need a per-frame animation loop with two independent pause paths: sight always pauses for offscreen elements or background tabs, while the configurable `unfocused` quality signal handles window blur.
- You want zero CPU when the element isn't visible (strong pause via `cancelAnimationFrame`).
- You need per-signal quality behavior (pause on blur, FPS throttle on frame budget overflow).
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
- Read `phase` and `phaseReason` to debug unexpected pauses. `qualityReason` names the reporting-priority signal, while `qualityBehavior` names the independently resolved action. Quality remains observable under `'ignore'`.
- Rely on the defaults: window blur pauses (the timeline freezes and resumes in place on refocus), frame-budget pressure throttles to `throttleFps`. When both are active, `pause` wins over `throttle` wins over `ignore`.
- Remember that `throttleFps` cannot raise a lower base `fps` cap.
- Use `frameBudget: 'pause'` for heavy canvas/WebGL that can't gracefully degrade.

### Frame-budget recovery

- `'throttle'`: quality remains degraded until another quality reconciliation observes recovery (for example, a focus event). Good throttled frames alone do not restore full quality.
- `'pause'`: a 2-second timer optimistically resumes and re-measures. Another sustained over-budget sequence pauses and schedules the next retry.
- `'ignore'`: quality remains observable, but phase, FPS, and canvas DPR are unchanged.

## Don't

- **Never call React `setState` inside `onTick`.** It fires 60 times/sec. Write to refs or DOM directly.
- **Never allocate inside `onTick`.** No objects, arrays, closures, template literals, or spreads. `FrameState` is mutated in place; reuse external variables.
- **Never store a reference to `frame`.** It's the same object every tick, mutated in place. Read values immediately.
- **Don't call `start()` after `stop()`.** `stop()` is terminal. Create a new loop instance.
- **Don't use `createLoop` without an element.** Throws `PhaseError` with code `no_element`.

## Reduced motion

Default: `'pause'`. The loop pauses entirely when reduced motion is enabled (`phaseReason` is `'reduced-motion'`), after delivering exactly one static frame (`elapsed: 0`) once the element is first visible. Canvas surfaces therefore show their initial state instead of staying blank.

- `'ignore'`: Keep running regardless. Use only for non-decorative motion (e.g. a data visualization that conveys information via movement).
- There is no `'complete'` for loops: an open-ended loop has no end state the library can know. Author the reduced-motion end state in markup or CSS (`motion-reduce:`), or use `useTween` for a value with a defined target.

## See also

- [createTicker](./create-ticker.md). The low-level rAF clock underneath createLoop; use when you don't need visibility management
- [createLifecycle](./create-lifecycle.md). The activation signal without the ticker; use when you own the render loop
- [useLoop](./use-loop.md). React hook wrapping createLoop with ref management
- [useCanvas](./use-canvas.md). React hook for canvas/WebGL with DPR handling on top of createLoop
- [abort-signals](./abort-signals.md). Stop this loop via the `signal` option
