# `useLoop`

The primary React hook. Wraps `createLoop` with React lifecycle management — visibility-aware animation loop that never triggers re-renders from the frame loop.

## Signature

```ts
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason, quality, qualityReason } = useLoop<T>(options);
```

### Options

| Option                | Type                                | Default      | Description                                        |
| --------------------- | ----------------------------------- | ------------ | -------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`              | returned     | Bring your own ref, or attach the returned one     |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called every frame — write to refs/DOM only        |
| `fps`                 | `number`                            | —            | Cap frames per second                              |
| `enabled`             | `boolean`                           | `true`       | When `false`, tears down the loop (reports `idle`) |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior under reduced motion                      |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades                     |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode                  |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to IO                                    |

### Return

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `ref`           | `RefObject<T \| null>`        | Attach to the animated element                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- Animating DOM elements in a per-frame loop (transforms, positions, colors).
- You need visibility-aware pausing (zero CPU off-screen).
- You want phase/quality signals exposed as React state for conditional rendering.

## When NOT to use — reach for X instead

| Instead of this                       | Use                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
| Canvas/WebGL animation                | `useCanvas` — adds DPR handling, resize, context loss recovery |
| You own the renderer (three.js, Pixi) | `useLifecycle` — gives active/paused signal                    |
| Single numeric value into render      | `useTween`                                                     |
| No React                              | `createLoop` (core)                                            |

## Do

- Cleanup is automatic — the effect teardown calls `stop()` on unmount. No manual cleanup needed.
- Attach the returned `ref` to the element you're animating:
  ```tsx
  const { ref } = useLoop({
    onTick: (frame) => {
      ref.current.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
    },
  });
  return <div ref={ref} />;
  ```
- Use `enabled` to conditionally tear down and restart the loop:
  ```tsx
  useLoop({ onTick: draw, enabled: isAnimating });
  ```
- Your `onTick` always sees the latest props/state/refs without restarting the loop (stored via `useSyncedRef` internally).

## Don't

- **Never call `setState` inside `onTick`** — triggers 60 re-renders/sec. Write to refs or DOM.
- **Never allocate inside `onTick`** — no objects, arrays, closures, or spreads. Template literals for the final `style.*` write are acceptable (see [performance.md](./performance.md)).
- **Never store a reference to `frame`** — same object mutated in place each tick.

## Reduced motion

Default `'pause'`: loop pauses, `phaseReason` is `'reduced-motion'`. Use `'complete'` for tweens that should jump to target. Use `'ignore'` only for non-decorative motion.

## See also

- [useCanvas](./use-canvas.md) — canvas/WebGL variant with DPR and resize handling
- [useLifecycle](./use-lifecycle.md) — activation signal for loops you own
- [createLoop](./create-loop.md) — framework-agnostic core
- [useTween](./use-tween.md) — single-value animation into React state
