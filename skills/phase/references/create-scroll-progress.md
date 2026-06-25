# `createScrollProgress`

Reports what fraction of an element is currently visible in the viewport (0–1) via the shared IntersectionObserver pool. Zero forced reflows, zero extra observers.

## Signature

```ts
import { createScrollProgress } from 'phase';

const progress = createScrollProgress(options: ScrollProgressOptions): ScrollProgress;
```

### Options

| Option       | Type                          | Default  | Description                                                     |
| ------------ | ----------------------------- | -------- | --------------------------------------------------------------- |
| `element`    | `Element`                     | required | Element to observe                                              |
| `onProgress` | `(ratio: number) => void`     | required | Called at each threshold crossing                               |
| `steps`      | `number`                      | `20`     | Number of evenly-spaced thresholds (21 values: 0%, 5%, …, 100%) |
| `root`       | `Element \| Document \| null` | —        | IO root element                                                 |
| `rootMargin` | `string`                      | —        | IO root margin                                                  |

### Return (ScrollProgress)

| Property | Type         | Description                                   |
| -------- | ------------ | --------------------------------------------- |
| `ratio`  | `number`     | Current intersection ratio (synchronous read) |
| `stop()` | `() => void` | Unobserve and cleanup                         |

## When to use

- Reveal/opacity effects based on how much of an element is visible.
- Progress indicators tied to element viewport coverage.
- Parallax-like effects driven by intersection ratio.

## When NOT to use — reach for X instead

| Instead of this                                           | Use                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Continuous scroll-scrubbing (scroll position as progress) | `motion`'s `useScroll` or native `ScrollTimeline` API |
| Boolean visibility (in view or not)                       | `createSight`                                         |
| React component                                           | `useScrollProgress`                                   |

**Important limitation:** `intersectionRatio` plateaus for tall elements once they fill the viewport. This is NOT a scroll-position tracker — it's a visibility-fraction tracker. For scroll-driven animation of tall content, use `ScrollTimeline`.

## Do

- Use for reveal effects (fade in as element enters viewport):
  ```ts
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  };
  ```
- Multiple instances with the same `steps` share a single IntersectionObserver — no performance penalty for many elements.
- Read `progress.ratio` synchronously when you need the current value outside the callback.

## Don't

- **Don't use for full scroll-scrubbing** — ratio plateaus for tall elements. Use ScrollTimeline.
- **Don't set `steps` extremely high** (e.g. 1000) — creates that many thresholds. 20–50 is appropriate for smooth visual results.
- **Don't call `getBoundingClientRect()` as a workaround** — that forces a reflow. Trust the async IO callback.

## Reduced motion

`createScrollProgress` does not automatically handle reduced motion — it reports a ratio. If the consumer is using the ratio for decorative animation, they should check `prefersReducedMotion()` and skip the animation.

## See also

- [useScrollProgress](./use-scroll-progress.md) — React hook wrapping createScrollProgress
- [createSight](./create-sight.md) — boolean visibility (visible/hidden) instead of ratio
- [prefers-reduced-motion](./prefers-reduced-motion.md) — check before animating with the ratio
