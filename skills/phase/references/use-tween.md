# `useTween`

Animates a number from its current position to `target` over a duration. Calls `setState` per frame — appropriate when the animated value is used in render output and the render is cheap.

## Signature

```ts
import { useTween } from 'phase/react';

const value: number = useTween(options);
```

### Options

| Option          | Type                                | Default        | Description                   |
| --------------- | ----------------------------------- | -------------- | ----------------------------- |
| `target`        | `number`                            | required       | Value to animate toward       |
| `duration`      | `number`                            | `300`          | Animation duration in ms      |
| `delay`         | `number`                            | `0`            | Delay before starting in ms   |
| `easing`        | `(progress: number) => number`      | `easeOutCubic` | Easing function               |
| `enabled`       | `boolean`                           | `true`         | When `false`, jumps to target |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'` | `'complete'`   | Behavior under reduced motion |

### Return

Returns the current animated `number`.

## When to use

- Counters, progress bars, opacity, single-value animations where the render tree below is cheap.
- The animated value must be in React state (rendered in JSX, not written to DOM directly).
- You want easing and interruption handling.

## When NOT to use — reach for X instead

| Instead of this                         | Use                              |
| --------------------------------------- | -------------------------------- |
| Many elements or expensive renders      | `useLoop` + ref-based DOM writes |
| Canvas animation                        | `useCanvas`                      |
| Pure CSS can do it (opacity, transform) | CSS `transition`                 |
| Spring physics                          | External library (motion)        |

## Do

- Use for cheap single-value tweens:
  ```tsx
  const opacity = useTween({ target: isVisible ? 1 : 0, duration: 300 });
  return <div style={{ opacity }}>{content}</div>;
  ```
- Change `target` to interrupt and re-animate from current position (smooth interruption).
- Use `delay` for staggered animations across multiple elements.

## Don't

- **Don't animate many values with separate `useTween` calls** — each triggers a re-render per frame. Use `useLoop` for batch DOM animation.
- **Don't pass `duration: 0` or negative** — throws `PhaseError` with code `invalid_duration`.
- **Don't use for canvas or WebGL** — `useTween` drives React state. Use `useCanvas`.

## Reduced motion

Default `'complete'`: jumps to target instantly. The value still arrives at its destination; the animation is skipped. This is the right default for tweens that must reach their final state.

## See also

- [useLoop](./use-loop.md) — per-frame DOM animation via refs (no re-renders)
- [ease](./ease.md) — easing functions used by useTween
- [useCanvas](./use-canvas.md) — canvas/WebGL animation
