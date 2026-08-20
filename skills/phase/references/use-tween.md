# `useTween`

Animates a number from its current position to `to` over a duration. Calls `setState` per frame, appropriate when the animated value is used in render output and the render is cheap.

## Signature

```ts
import { useTween } from 'phase/react';

const value: number = useTween(options);
```

### Options

| Option          | Type                           | Default        | Description                            |
| --------------- | ------------------------------ | -------------- | -------------------------------------- |
| `to`            | `number`                       | required       | Value to animate toward                |
| `duration`      | `number`                       | `300`          | Animation duration in ms               |
| `delay`         | `number`                       | `0`            | Delay before starting in ms            |
| `easing`        | `(progress: number) => number` | `easeOutCubic` | Easing function                        |
| `enabled`       | `boolean`                      | `true`         | When `false`, jumps to the destination |
| `reducedMotion` | `'complete' \| 'ignore'`       | `'complete'`   | Behavior under reduced motion          |

### Return

Returns the current animated `number`.

## When to use

- Counters, progress bars, opacity, single-value animations where the render tree below is cheap.
- The animated value must be in React state (rendered in JSX, not written to DOM directly).
- You want easing and interruption handling.

## When not to use

| Instead of this                         | Use                              |
| --------------------------------------- | -------------------------------- |
| Many elements or expensive renders      | `useLoop` + ref-based DOM writes |
| Canvas animation                        | `useCanvas`                      |
| Pure CSS can do it (opacity, transform) | CSS `transition`                 |
| Spring physics                          | External library (motion)        |

## Do

- Use for cheap single-value tweens:
  ```tsx
  const opacity = useTween({ to: isVisible ? 1 : 0, duration: 300 });
  return <div style={{ opacity }}>{content}</div>;
  ```
- Change `to` to interrupt and re-animate from current position (smooth interruption).
- Custom easing controls intermediate values; completed tweens land exactly on `to`.
- Replacing `easing` updates future frames without restarting the active tween.
- Use `delay` for staggered animations across multiple elements.

## Don't

- **Don't animate many values with separate `useTween` calls.** Each triggers a re-render per frame. Use `useLoop` for batch DOM animation.
- **Don't pass `duration: 0` or negative.** Throws `PhaseError` with code `invalid_duration`.
- **Don't use for canvas or WebGL.** `useTween` drives React state. Use `useCanvas`.

## Reduced motion

Default `'complete'` checks the preference when a tween starts and jumps to `to` when reduced motion is already preferred. `'ignore'` skips the preference read. The exported `TweenReducedMotion` type is `'complete' | 'ignore'`; finite tweens do not support `'pause'` because freezing between endpoints leaves the value incomplete.

## See also

- [useLoop](./use-loop.md). Per-frame DOM animation via refs (no re-renders)
- [ease](./ease.md). Easing functions used by useTween
- [useCanvas](./use-canvas.md). Canvas/WebGL animation
