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
| `signal`     | `AbortSignal`                 | —        | Stops the observer when the signal is aborted                   |

### Return (ScrollProgress)

| Property | Type         | Description                                   |
| -------- | ------------ | --------------------------------------------- |
| `ratio`  | `number`     | Current intersection ratio (synchronous read) |
| `stop()` | `() => void` | Unobserve and cleanup                         |

## When to use

- Reveal/opacity effects based on how much of an element is visible.
- Progress indicators tied to element viewport coverage.
- Parallax-like effects driven by intersection ratio.

## When not to use

| Instead of this                                         | Use                         |
| ------------------------------------------------------- | --------------------------- |
| A container's own scroll offset (scrollbars, carousels) | `createScroll`              |
| CSS-declarative scroll-linked animation                 | native `ScrollTimeline` API |
| Spring- or gesture-driven scroll                        | `motion`                    |
| Boolean visibility (in view or not)                     | `createSight`               |
| React component                                         | `useScrollProgress`         |

**Important limitation:** `intersectionRatio` plateaus for tall elements once they fill the viewport. This tracks visibility fraction, not scroll position. For a scroll container's own offset (scrollbars, carousels) use [`createScroll`](./create-scroll.md); for CSS-declarative scroll-linked animation of tall content use `ScrollTimeline`.

## Do

- Use for reveal effects (fade in as element enters viewport):
  ```ts
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  };
  ```
- Multiple instances with the same `steps` share a single IntersectionObserver, so there is no performance penalty for many elements.
- Read `progress.ratio` synchronously when you need the current value outside the callback.

## Don't

- **Don't use for a container's scroll offset.** See the limitation above; use [`createScroll`](./create-scroll.md) for scrollbars/carousels.
- **Don't set `steps` extremely high** (e.g. 1000). Creates that many thresholds. 20–50 is appropriate for smooth visual results.
- **Don't call `getBoundingClientRect()` as a workaround.** That forces a reflow. Trust the async IO callback.

## Reduced motion

`createScrollProgress` does not automatically handle reduced motion. It reports a ratio. If the consumer is using the ratio for decorative animation, they should check `prefersReducedMotion()` and skip the animation.

## See also

- [useScrollProgress](./use-scroll-progress.md). React hook wrapping createScrollProgress
- [createScroll](./create-scroll.md). A scroll container's own offset/progress, not viewport visibility ratio
- [createSight](./create-sight.md). Boolean visibility (visible/hidden) instead of ratio
- [prefers-reduced-motion](./prefers-reduced-motion.md). Check before animating with the ratio
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option
