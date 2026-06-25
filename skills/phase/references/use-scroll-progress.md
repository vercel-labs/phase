# `useScrollProgress`

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management. Re-renders only at threshold crossings.

## Signature

```ts
import { useScrollProgress } from 'phase/react';

const { ref, progress } = useScrollProgress<T>(options?);
```

### Options

| Option       | Type                   | Default  | Description                        |
| ------------ | ---------------------- | -------- | ---------------------------------- |
| `ref`        | `RefObject<T \| null>` | returned | Bring your own ref                 |
| `steps`      | `number`               | `20`     | Number of evenly-spaced thresholds |
| `root`       | `Element \| null`      | —        | IO root element                    |
| `rootMargin` | `string`               | —        | IO root margin                     |

### Return

| Property   | Type                   | Description                                           |
| ---------- | ---------------------- | ----------------------------------------------------- |
| `ref`      | `RefObject<T \| null>` | Attach to the observed element                        |
| `progress` | `number`               | Fraction visible (0–1). `0` before first observation. |

## When to use

- Reveal/opacity effects driven by how much of an element is visible.
- Progress indicators tied to viewport coverage.
- Simple parallax effects (clamped to element visibility, not scroll position).

## When NOT to use — reach for X instead

| Instead of this                       | Use                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| Continuous scroll-scrubbing           | `motion`'s `useScroll` or native `ScrollTimeline`                 |
| Boolean visibility                    | `useSight`                                                        |
| Per-frame DOM writes driven by scroll | `createScrollProgress` + `useLoop` (avoid setState per threshold) |

## Do

- Cleanup is automatic — the observer is unsubscribed on unmount.
- Use for declarative reveal effects:
  ```tsx
  const { ref, progress } = useScrollProgress();
  return (
    <div ref={ref} style={{ opacity: progress }}>
      {children}
    </div>
  );
  ```
- Adjust `steps` for smoother or coarser updates (higher = more re-renders).

## Don't

- **Don't expect continuous values** — updates only at threshold crossings (~20 per viewport traversal at default steps).
- **Don't use for tall elements expecting full 0→1 scroll** — ratio plateaus once the element fills the viewport. Use `ScrollTimeline`.

## Reduced motion

`useScrollProgress` doesn't handle reduced motion — it's a ratio, not an animation. If using the ratio for decorative animation, check `prefersReducedMotion()` or use `useLoop` which handles it.

## See also

- [createScrollProgress](./create-scroll-progress.md) — framework-agnostic core
- [useSight](./use-sight.md) — boolean visibility instead of ratio
- [useLoop](./use-loop.md) — if you need per-frame writes, combine with createScrollProgress
