# `useLoop`

The primary React hook. Wraps `createLoop` with React lifecycle management. Visibility-aware animation loop that never triggers re-renders from the frame loop.

## Signature

```ts
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason, quality, qualityReason } = useLoop<T>(options);
```

### Options

| Option                | Type                                | Default      | Description                                                        |
| --------------------- | ----------------------------------- | ------------ | ------------------------------------------------------------------ |
| `ref`                 | `RefObject<T \| null>`              | returned     | Bring your own ref, or attach the returned one                     |
| `target`              | `Document`                          | —            | Anchor to the page; pass `document`. Mutually exclusive with `ref` |
| `onTick`              | `LoopTickFn`                        | required     | Called every frame (write to refs/DOM only)                        |
| `fps`                 | `number`                            | —            | Cap frames per second                                              |
| `enabled`             | `boolean`                           | `true`       | When `false`, tears down the loop (reports `idle`)                 |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior under reduced motion                                      |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades                                     |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode                                  |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to IO                                                    |

### Return

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `ref`           | `RefObject<T \| null>`        | Attach to the animated element                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- Animating DOM elements whose frames depend on live JS input or simulation state.
- You need visibility-aware pausing (zero CPU off-screen).
- You want phase/quality signals exposed as React state for conditional rendering.

## When not to use

| Instead of this                            | Use                                                            |
| ------------------------------------------ | -------------------------------------------------------------- |
| Browser-animatable timeline known at start | CSS/WAAPI + `useLifecycle`                                     |
| Canvas/WebGL animation                     | `useCanvas` (adds DPR handling, resize, context loss recovery) |
| You own the renderer (three.js, Pixi)      | `useLifecycle` (gives active/paused signal)                    |
| Single numeric value into render           | `useTween`                                                     |
| No React                                   | `createLoop` (core)                                            |

## Do

- Cleanup is automatic. The effect teardown calls `stop()` on unmount. No manual cleanup needed.
- Attach the returned `ref` to the element you're animating:

  ```tsx
  const xRef = useRef(0);
  const velocityRef = useRef(0.1); // pixels per millisecond
  const { ref } = useLoop({
    onTick: (frame) => {
      const element = ref.current;
      if (!element) return;

      xRef.current += velocityRef.current * frame.delta;
      element.style.transform = `translateX(${xRef.current}px)`;
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

## Page anchor

Pass `target: document` when the loop is not tied to one element (a page-wide effect, a scroll-driven header, a global cursor layer):

```tsx
const { phase } = useLoop({
  target: document,
  onTick: () => {
    headerRef.current!.style.setProperty('--y', String(scrollRef.current.y));
  },
});
```

The loop still strong-pauses when the tab is hidden and still honors reduced motion; it just has no viewport test to make, so no `IntersectionObserver` is created. `target` is mutually exclusive with `ref`; passing both throws `conflicting_target`.

Prefer an element `ref` when the animation belongs to one element. Off-screen pausing is the main reason to use `useLoop`, and a page anchor gives that up.

## Don't

- **Never call `setState` inside `onTick`.** Triggers 60 re-renders/sec. Write to refs or DOM.
- **Never allocate inside `onTick`.** No objects, arrays, closures, or spreads. Template literals for the final `style.*` write are acceptable (see [performance.md](./performance.md)).
- **Never store a reference to `frame`.** Same object mutated in place each tick.

## Reduced motion

Default `'pause'`: loop pauses, `phaseReason` is `'reduced-motion'`. Use `'complete'` for tweens that should jump to target. Use `'ignore'` only for non-decorative motion.

## See also

- [useCanvas](./use-canvas.md). Canvas/WebGL variant with DPR and resize handling
- [useLifecycle](./use-lifecycle.md). Activation signal for loops you own
- [createLoop](./create-loop.md). Framework-agnostic core
- [useTween](./use-tween.md). Single-value animation into React state
