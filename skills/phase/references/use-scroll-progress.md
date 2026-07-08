# `useScrollProgress`

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management. Re-renders only at threshold crossings.

## Signature

```ts
import { useScrollProgress } from 'phase/react';

const { ref, progress, progressRef } = useScrollProgress<T>(options?);
```

### Options

| Option       | Type                         | Default  | Description                                                                            |
| ------------ | ---------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `ref`        | `RefObject<T \| null>`       | returned | Bring your own ref                                                                     |
| `steps`      | `number`                     | `20`     | Number of evenly-spaced thresholds                                                     |
| `root`       | `Element \| null`            | —        | IO root element                                                                        |
| `rootMargin` | `string`                     | —        | IO root margin                                                                         |
| `onProgress` | `(progress: number) => void` | —        | Called on every threshold crossing. When provided, `progress` stays `0`, no re-renders |

### Return

| Property      | Type                   | Description                                                                           |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `ref`         | `RefObject<T \| null>` | Attach to the observed element                                                        |
| `progress`    | `number`               | Fraction visible (0–1). `0` before first observation. Always `0` with `onProgress`    |
| `progressRef` | `RefObject<number>`    | Fraction visible via ref. Always current regardless of mode, never triggers re-render |

## When to use

- Reveal/opacity effects driven by how much of an element is visible.
- Progress indicators tied to viewport coverage.
- Parallax effects (clamped to element visibility, not scroll position).
- **With `onProgress`**: scroll-driven animation consumers that read progress imperatively without re-renders.

## When not to use

| Instead of this                       | Use                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| Continuous scroll-scrubbing           | `motion`'s `useScroll` or native `ScrollTimeline`                 |
| Boolean visibility                    | `useSight`                                                        |
| Per-frame DOM writes driven by scroll | `createScrollProgress` + `useLoop` (avoid setState per threshold) |

## Do

- Cleanup is automatic. The observer is unsubscribed on unmount.
- Use for declarative reveal effects:
  ```tsx
  const { ref, progress } = useScrollProgress();
  return (
    <div ref={ref} style={{ opacity: progress }}>
      {children}
    </div>
  );
  ```
- Use `onProgress` for zero-re-render scroll-driven animation:
  ```tsx
  const { ref, progressRef } = useScrollProgress({
    onProgress: (p) => {
      el.style.opacity = String(p);
    },
  });
  ```
- Read `progressRef.current` inside `onTick` callbacks for the latest ratio without closure staleness.
- Adjust `steps` for smoother or coarser updates (higher = more re-renders).

## Don't

- **Don't expect continuous values.** Updates only at threshold crossings (~20 per viewport traversal at default steps).
- **Don't use for tall elements expecting full 0→1 scroll.** Ratio plateaus once the element fills the viewport. Use `ScrollTimeline`.

## Reduced motion

`useScrollProgress` reports a ratio, not an animation, and does not handle reduced motion. If using the ratio for decorative animation, check `prefersReducedMotion()` or use `useLoop` which handles it.

## See also

- [createScrollProgress](./create-scroll-progress.md). Framework-agnostic core
- [useSight](./use-sight.md). Boolean visibility instead of ratio
- [useLoop](./use-loop.md). If you need per-frame writes, combine with createScrollProgress
