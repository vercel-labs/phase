# `useIdle`

Returns `false`, then `true` after `requestIdleCallback` when available or in the next task when it is not. The boolean hook behind `WhenIdle`. Use it only for non-critical work that can tolerate the fallback running before the browser is idle.

## Signature

```ts
import { useIdle } from 'phase/react';

const idle = useIdle({ timeout: 2000 });
```

### Options

| Option    | Type     | Default | Description                              |
| --------- | -------- | ------- | ---------------------------------------- |
| `timeout` | `number` | —       | Max ms to wait before flipping to `true` |

## When to use

- Conditionally render non-critical UI after an idle callback or next-task fallback.
- Kick off deferrable side effects such as prefetch or analytics initialization.
- You need the boolean directly rather than the `WhenIdle` mounting wrapper.

## When not to use

| Instead of this                      | Use                         |
| ------------------------------------ | --------------------------- |
| Mounting from the scheduled callback | `WhenIdle`                  |
| Running a one-off idle callback      | `whenIdle` (no React state) |
| Gating on viewport visibility        | `useSight` / `WhenVisible`  |

## Do

- **Gate non-critical rendering:**
  ```tsx
  const idle = useIdle();
  return idle ? <Analytics /> : null;
  ```

## Don't

- **Don't use for SSR-critical content.** Returns `false` on the server and the first client render, so scheduled content is absent from server HTML.
- **Don't drive per-frame work off it.** It flips once and stays `true`; it is not a loop.

## Reduced motion

Not applicable. `useIdle` is a scheduling signal, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [rendering-recipes](./rendering-recipes.md). Sequencing work with `useIdle` and composing the rendering helpers
- [use-when-idle](./use-when-idle.md). The effect form for non-critical side effects
- [when-idle](./when-idle.md). The mounting wrapper around `useIdle`
- [use-sight](./use-sight.md). Visibility-based gating instead of idle
