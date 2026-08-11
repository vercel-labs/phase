# `useLoop`

The primary React hook. Wraps `createLoop` with React lifecycle management. Visibility-aware animation loop that never triggers re-renders from the frame loop.

## Signature

```ts
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason, quality, qualityReason, qualityBehavior } =
  useLoop<T>(options);
```

### Options

| Option                | Type                                | Default      | Description                                             |
| --------------------- | ----------------------------------- | ------------ | ------------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`              | returned     | Bring your own ref, or attach the returned one          |
| `onTick`              | `LoopTickFn`                        | required     | Called every frame (write to refs/DOM only)             |
| `fps`                 | `number`                            | none         | Base FPS cap; uncapped uses display refresh             |
| `enabled`             | `boolean`                           | `true`       | When `false`, tears down the loop (reports `idle`)      |
| `reducedMotion`       | `'pause' \| 'ignore'`               | `'pause'`    | Behavior under reduced motion                           |
| `unfocused`           | `'pause' \| 'throttle' \| 'ignore'` | `'pause'`    | Behavior while the window is unfocused                  |
| `frameBudget`         | `'pause' \| 'throttle' \| 'ignore'` | `'throttle'` | Behavior after 3 frames exceed 1.5x the target interval |
| `throttleFps`         | `number`                            | `30`         | Shared throttle cap; never raises a lower `fps`         |
| `intersectionOptions` | `IntersectionObserverInit`          | none         | Forwarded to IO                                         |
| `onQualityChange`     | `QualityChangeCallback`             | none         | Transient notification; does not trigger a render       |

### Return

| Property          | Type                            | Description                                                                                      |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ref`             | `RefObject<T \| null>`          | Attach to the animated element                                                                   |
| `phase`           | `LoopPhase`                     | `'idle' \| 'running' \| 'paused' \| 'stopped'`                                                   |
| `phaseReason`     | `LoopReason`                    | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'degraded' \| 'disposed'` |
| `quality`         | `Quality`                       | Always-current signal state; no quality-only render                                              |
| `qualityReason`   | `DegradedReason \| undefined`   | Always-current reason; unfocused reports first when both are active                              |
| `qualityBehavior` | `DegradedBehavior \| undefined` | Always-current resolved behavior after precedence                                                |

## When to use

- Animating DOM elements in a per-frame loop (transforms, positions, colors).
- You need visibility-aware pausing (zero CPU off-screen).
- You want reactive phase state plus always-current quality getters and transient quality notification.

## When not to use

| Instead of this                       | Use                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
| Canvas/WebGL animation                | `useCanvas` (adds DPR handling, resize, context loss recovery) |
| You own the renderer (three.js, Pixi) | `useLifecycle` (gives active/paused signal)                    |
| Single numeric value into render      | `useTween`                                                     |
| No React                              | `createLoop` (core)                                            |

## Do

- Cleanup is automatic. The effect teardown calls `stop()` on unmount. No manual cleanup needed.
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
- Extract `onTick` to a named function using the exported `LoopTickFn` type: `const tick: LoopTickFn = (frame) => { ... }`.

## Don't

- **Never call `setState` inside `onTick`.** Triggers 60 re-renders/sec. Write to refs or DOM.
- **Never allocate inside `onTick`.** No objects, arrays, closures, or spreads. Template literals for the final `style.*` write are acceptable (see [performance.md](./performance.md)).
- **Never store a reference to `frame`.** Same object mutated in place each tick.

## Quality signals

Each signal has its own behavior; `pause` wins over `throttle` wins over `ignore` when both are active. The defaults pause on window blur (the timeline freezes and resumes in place on refocus, with no restart or catch-up) and throttle on frame-budget pressure. `quality`, `qualityReason`, and `qualityBehavior` stay current through refs even when the loop remains running, and stay observable under `'ignore'`. They do not cause quality-only React renders; use `onQualityChange` for transient notification. If both signals are active, the reason reports unfocused first while the behavior reports the independently resolved action. `throttleFps` is shared and cannot raise a lower base `fps`.

Frame-budget throttle does not auto-recover from good throttled frames alone; another quality reconciliation must observe recovery. `frameBudget: 'pause'` retries after 2 seconds. See [createLoop](./create-loop.md#frame-budget-recovery) for the full matrix.

## Reduced motion

Default `'pause'`: the loop pauses with `phaseReason` `'reduced-motion'`, after painting exactly one static frame (`elapsed: 0`) once the element is first visible. There is no `'complete'` for loops because an open-ended loop has no end state the library can know. Author the reduced-motion end state in markup or CSS (`motion-reduce:`), or use `useTween` for a value with a defined target. Use `'ignore'` only for non-decorative motion.

## See also

- [useCanvas](./use-canvas.md). Canvas/WebGL variant with DPR and resize handling
- [useLifecycle](./use-lifecycle.md). Activation signal for loops you own
- [createLoop](./create-loop.md). Framework-agnostic core
- [useTween](./use-tween.md). Single-value animation into React state
