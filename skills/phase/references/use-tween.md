# `useTween`

Animates a number from its current position to `target` over a duration. Calls `setState` per frame, appropriate when the animated value is used in render output and the render is cheap.

## Signature

```ts
import { useTween } from 'phase/react';

const value: number = useTween(options);
```

### Options

| Option          | Type                           | Default        | Description                   |
| --------------- | ------------------------------ | -------------- | ----------------------------- |
| `target`        | `number`                       | required       | Value to animate toward       |
| `duration`      | `number`                       | `300`          | Animation duration in ms      |
| `delay`         | `number`                       | `0`            | Delay before starting in ms   |
| `easing`        | `(progress: number) => number` | `easeOutCubic` | Easing function               |
| `enabled`       | `boolean`                      | `true`         | When `false`, jumps to target |
| `reducedMotion` | `'complete' \| 'ignore'`       | `'complete'`   | Behavior under reduced motion |

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
  const opacity = useTween({ target: isVisible ? 1 : 0, duration: 300 });
  return <div style={{ opacity }}>{content}</div>;
  ```
- Change `target` to interrupt and re-animate from current position (smooth interruption).
- Use `delay` for staggered animations across multiple elements.

## Don't

- **Don't animate many values with separate `useTween` calls.** Each triggers a re-render per frame. Use `useLoop` for batch DOM animation.
- **Don't pass `duration: 0` or negative.** Throws `PhaseError` with code `invalid_duration`.
- **Don't use for canvas or WebGL.** `useTween` drives React state. Use `useCanvas`.

## Reduced motion

Default `'complete'`: jumps to target instantly. The value still arrives at its destination. The animation is skipped. This is the right default for tweens that must reach their final state. There is no `'pause'` for tweens because a value frozen mid-flight reads as a stuck UI. The type is `TweenReducedMotion` (`'complete' | 'ignore'`).

## Timing model

`useTween` is a finite React-state tween with its own rAF. It does not use the shared ticker clock, `FrameState`, visibility pausing, focus quality, slow-frame throttling, or delta clamping. Active tweens subscribe to reduced motion and complete immediately if the preference changes. Completion always lands exactly on `target`, even when a custom easing function does not return `1`. Use `useLoop` / `useCanvas` when loop lifecycle guarantees are required.

A tween that is already running subscribes to the preference and completes as soon as it turns on, so the value lands on `target` instead of freezing mid-flight. Under `reducedMotion: 'ignore'` no subscription is made. The latest `easing` callback is read through a synced ref without restarting the tween.

## See also

- [useLoop](./use-loop.md). Per-frame DOM animation via refs (no re-renders)
- [ease](./ease.md). Easing functions used by useTween
- [useCanvas](./use-canvas.md). Canvas/WebGL animation
