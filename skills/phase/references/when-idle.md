# `WhenIdle`

Mounts children after `requestIdleCallback` when available or in the next task when it is not. One-shot (once mounted, stays mounted). Use it for non-critical UI that can tolerate the fallback running before the browser is idle.

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
| `fallback` | `ReactNode`             | —       | Shown until the scheduled mount runs  |
| `ref`      | `Ref<HTMLDivElement>`   | —       | Forward a ref (after mount)           |
| ...rest    | `ComponentProps<'div'>` | —       | All standard div props                |

### Options (`whenIdle`)

| Option    | Type          | Default | Description                                      |
| --------- | ------------- | ------- | ------------------------------------------------ |
| `timeout` | `number`      | —       | Max ms to wait before running even if never idle |
| `signal`  | `AbortSignal` | —       | Cancels the scheduled callback when aborted      |

### Data attributes stamped (after the scheduled mount)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Non-critical UI that is safe to mount after an idle callback or next-task fallback (secondary panels, below-the-fold widgets, analytics).
- Work that must run eventually and is safe on the same fallback (`whenIdle` for cache warming or prefetch).

## When not to use

| Instead of this                     | Use                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Content that must be in SSR HTML    | `Defer` (`WhenIdle` children are not server-rendered) |
| Mount when scrolled into view       | `WhenVisible`                                         |
| Critical content needed immediately | Render it directly. Don't defer.                      |

## Do

- **Reserve the child's final in-flow footprint** through the wrapper, parent layout, or `fallback` when mounting would otherwise change layout:
  ```tsx
  <WhenIdle fallback={<Skeleton className="h-[320px]" />}>
    <Comments />
  </WhenIdle>
  ```
- **Set a `timeout`** when the work should not wait indefinitely on a busy main thread.

## Don't

- **Don't use for above-the-fold or SEO-critical content.** Idle never fires during SSR, so children are absent from server HTML.
- **Don't expect unmount.** Like `WhenVisible`, it is one-shot.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts. Only the enter animation is skipped.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `WhenIdle` with `lazy()`, `Suspense`, and the other helpers
- [when-visible](./when-visible.md). Gate mounting on viewport entry
- [defer](./defer.md). Keep content in the DOM but skip painting
- [use-idle](./use-idle.md). The boolean hook behind `WhenIdle`
- [use-when-idle](./use-when-idle.md). Schedule a non-critical side effect with the same fallback
- [abort-signals](./abort-signals.md). Cancel the `whenIdle` callback via the `signal` option
