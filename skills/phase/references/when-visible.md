# `WhenVisible`

Mounts children when the element enters the viewport. One-shot (once triggered, stays mounted). Uses pooled IntersectionObserver via `useSight`.

## Signature

```tsx
import { WhenVisible } from 'phase/react';

<WhenVisible rootMargin="200px" className="...">
  <HeavyContent />
</WhenVisible>;
```

### Props

| Prop         | Type                    | Default   | Description                       |
| ------------ | ----------------------- | --------- | --------------------------------- |
| `rootMargin` | `string`                | `'200px'` | IO rootMargin (preload headroom)  |
| `threshold`  | `number \| number[]`    | —         | IO threshold                      |
| `root`       | `Element \| null`       | —         | IO root element                   |
| `fallback`   | `ReactNode`             | —         | Shown while awaiting intersection |
| `ref`        | `Ref<HTMLDivElement>`   | —         | Forward a ref                     |
| ...rest      | `ComponentProps<'div'>` | —         | All standard div props            |

### Data attributes stamped (after visible)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Viewport-gated lazy loading (heavy charts, images, interactive widgets).
- Code-split components that should only load when scrolled into view.
- Scroll-triggered reveal animations (fade in on enter).

## When NOT to use — reach for X instead

| Instead of this             | Use                                             |
| --------------------------- | ----------------------------------------------- |
| Show/hide that can reverse  | `<Presence>` with `mode: 'reveal'`              |
| Need exit animation         | `<Presence>` — WhenVisible is one-shot, no exit |
| Boolean visibility tracking | `useSight` — for observation without mounting   |

## Do

- Combine with `lazy()` + `Suspense` for code-split lazy loading:
  ```tsx
  const HeavyChart = lazy(() => import('./heavy-chart'));
  <WhenVisible
    rootMargin="200px"
    className="transition-opacity data-[enter=animate]:starting:opacity-0"
  >
    <Suspense fallback={<Skeleton />}>
      <HeavyChart />
    </Suspense>
  </WhenVisible>;
  ```
- Use `rootMargin` to preload before the element is visible (e.g. `'200px'` starts loading 200px early).
- **Render the `fallback` at the final content's height** so nothing shifts when children mount.
- In Next.js, prefer `next/dynamic` over `lazy()` (SSR-aware, integrates a `loading` placeholder). See [rendering-recipes.md](./rendering-recipes.md).

## Don't

- **Don't expect it to unmount when scrolled away** — it's one-shot. Once visible, stays mounted.
- **Don't use for exit animations** — `WhenVisible` has no exit phase. Use `<Presence>`.
- **Don't set `rootMargin: '0px'`** unless you want no preloading headroom.
- **Don't ship a zero-height `fallback`** — a mismatched placeholder height causes layout shift on mount.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts — the enter animation is simply skipped.

## See also

- [rendering-recipes](./rendering-recipes.md) — two-tier `Defer` + `WhenVisible` and other compositions
- [presence](./presence.md) — show/hide with exit animation
- [useSight](./use-sight.md) — boolean visibility without mounting
- [swap](./swap.md) — coordinated state transitions
