# `WhenIdle`

Mounts children once the browser is idle after first paint. One-shot (once mounted, stays mounted). Backed by the `whenIdle` core utility (`requestIdleCallback`). Use it to defer non-critical UI off the critical path.

## Signature

```tsx
import { WhenIdle } from 'phase/react';

<WhenIdle fallback={<Skeleton />} timeout={2000} className="...">
  <SecondaryPanel />
</WhenIdle>;
```

```ts
// Core utility
import { whenIdle } from 'phase';

const cancel = whenIdle(() => warmCache(), { timeout: 2000 });
cancel(); // optional: prevent the callback before it runs
```

### Props (`WhenIdle`)

| Prop       | Type                    | Default | Description                           |
| ---------- | ----------------------- | ------- | ------------------------------------- |
| `timeout`  | `number`                | —       | Max ms to wait before mounting anyway |
| `fallback` | `ReactNode`             | —       | Shown until the browser is idle       |
| `ref`      | `Ref<HTMLDivElement>`   | —       | Forward a ref (after mount)           |
| ...rest    | `ComponentProps<'div'>` | —       | All standard div props                |

### Options (`whenIdle`)

| Option    | Type     | Default | Description                                      |
| --------- | -------- | ------- | ------------------------------------------------ |
| `timeout` | `number` | —       | Max ms to wait before running even if never idle |

### Data attributes stamped (after idle)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Non-critical UI that should not compete with first paint (secondary panels, below-the-fold widgets, analytics).
- Work that must run eventually but not on the critical path (`whenIdle` for cache warming, prefetch).

## When NOT to use — reach for X instead

| Instead of this                     | Use                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Content that must be in SSR HTML    | `Defer` — `WhenIdle` children are not server-rendered |
| Mount when scrolled into view       | `WhenVisible`                                         |
| Critical content needed immediately | Render it directly — don't defer                      |

## Do

- **Render the `fallback` at the final content's height** to avoid layout shift when children mount:
  ```tsx
  <WhenIdle fallback={<Skeleton className="h-[320px]" />}>
    <Comments />
  </WhenIdle>
  ```
- **Set a `timeout`** when the work should not wait indefinitely on a busy main thread.

## Don't

- **Don't use for above-the-fold or SEO-critical content** — idle never fires during SSR, so children are absent from server HTML.
- **Don't expect unmount** — like `WhenVisible`, it is one-shot.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts — only the enter animation is skipped.

## See also

- [rendering-recipes](./rendering-recipes.md) — composing `WhenIdle` with `lazy()`, `Suspense`, and the other helpers
- [when-visible](./when-visible.md) — gate mounting on viewport entry
- [defer](./defer.md) — keep content in the DOM but skip painting
- [use-idle](./use-idle.md) — the boolean hook behind `WhenIdle`
- [use-when-idle](./use-when-idle.md) — run a side effect (prefetch, `import()`) once idle
