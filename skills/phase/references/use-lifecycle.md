# `useLifecycle`

The activation signal for loops you own. Wraps `createLifecycle` — returns `active` / `paused` so a consumer-owned render loop can pause when off-screen or under reduced motion.

## Signature

```ts
import { useLifecycle } from 'phase/react';

const { ref, phase, phaseReason, isActive } = useLifecycle<T>(options?);
```

### Options

| Option                | Type                       | Default   | Description                                 |
| --------------------- | -------------------------- | --------- | ------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`     | returned  | Bring your own ref                          |
| `reducedMotion`       | `'pause' \| 'ignore'`      | `'pause'` | Whether reduced motion pauses the lifecycle |
| `paused`              | `boolean`                  | `false`   | Manual pause (e.g. panel covers animation)  |
| `enabled`             | `boolean`                  | `true`    | When `false`, tears down and reports `idle` |
| `intersectionOptions` | `IntersectionObserverInit` | —         | Forwarded to IO                             |

### Return

| Property      | Type                   | Description                                                                                    |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `ref`         | `RefObject<T \| null>` | Attach to the element whose visibility gates your loop                                         |
| `phase`       | `LifecyclePhase`       | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason`      | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |
| `isActive`    | `boolean`              | Convenience: `phase === 'active'`                                                              |

## When to use

- You own the render loop (three.js, Pixi, WebGL, a Web Worker) but want phase's lifecycle guarantees.
- You need `paused` prop support for UI-driven suspension.
- You want a single `isActive` boolean to gate your `useEffect`-based loop.

## When NOT to use — reach for X instead

| Instead of this                            | Use                      |
| ------------------------------------------ | ------------------------ |
| You want phase to drive the loop           | `useLoop` or `useCanvas` |
| Just need visibility (no animation gating) | `useSight`               |
| Framework-agnostic code                    | `createLifecycle`        |

## Do

- Cleanup is automatic — the effect teardown calls `stop()` on unmount. No manual cleanup needed.
- Gate your renderer with `isActive`:
  ```tsx
  const { ref, isActive } = useLifecycle();
  useEffect(() => {
    if (!isActive) return;
    let raf = requestAnimationFrame(function render() {
      renderer.render();
      raf = requestAnimationFrame(render);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);
  return <canvas ref={ref} />;
  ```
- Use `paused` for contextual suspension (modal, settings panel).

- Use as a thin RSC boundary for CSS animations with server-rendered content. Wrap `useLifecycle` in a named client component — the naming IS the documentation:

  ```tsx
  'use client';
  export function LogoAnimationGate({ children }: { children: ReactNode }) {
    const { ref, isActive } = useLifecycle({
      intersectionOptions: { rootMargin: '50px', threshold: 0.5 },
    });

    return (
      <div
        ref={ref}
        data-active={isActive || undefined}
        className={
          isActive
            ? 'will-change-transform [animation-play-state:running]'
            : '[animation-play-state:paused]'
        }
      >
        {children}
      </div>
    );
  }
  ```

  Name the wrapper for your context (`LogoAnimationGate`, `CarouselAnimationGate`). Server-rendered children pass through without hydration.

## Don't

- **Don't use `useLifecycle` when `useLoop` would work** — if phase can drive the loop, let it (you get quality signals, frame budget tracking, and shared clock for free).
- **Don't set `paused` to implement visibility pausing** — that's automatic. Manual pause is for UI scenarios only.
- **Don't ship a generic `<Lifecycle>` component** — unlike `Presence` (which has real transitionend/timeout logic), the lifecycle wrapper is 4 lines. Name it contextually and own those lines.

## Reduced motion

Default `'pause'`: `isActive` becomes `false`, `phaseReason` is `'reduced-motion'`. Your renderer should stop entirely. With `'ignore'`: lifecycle stays active regardless.

## See also

- [useLoop](./use-loop.md) — use when phase should drive the loop
- [useCanvas](./use-canvas.md) — use for canvas where phase drives the loop
- [useSight](./use-sight.md) — pure visibility, no animation gating
- [createLifecycle](./create-lifecycle.md) — framework-agnostic core
