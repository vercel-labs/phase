# `useIdle`

Returns `false`, then `true` once the browser is idle after mount. The boolean hook behind `WhenIdle`. Use it to defer non-critical work or conditional rendering until the main thread is free.

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

- Conditionally render non-critical UI after the page settles.
- Kick off deferrable side effects (prefetch, analytics init) once idle.
- You need the boolean directly rather than the `WhenIdle` mounting wrapper.

## When NOT to use — reach for X instead

| Instead of this                 | Use                         |
| ------------------------------- | --------------------------- |
| Mounting a subtree when idle    | `WhenIdle`                  |
| Running a one-off idle callback | `whenIdle` (no React state) |
| Gating on viewport visibility   | `useSight` / `WhenVisible`  |

## Do

- **Gate non-critical rendering:**
  ```tsx
  const idle = useIdle();
  return idle ? <Analytics /> : null;
  ```

## Don't

- **Don't use for SSR-critical content** — returns `false` on the server and the first client render, so idle-gated content is absent from server HTML.
- **Don't drive per-frame work off it** — it flips once and stays `true`; it is not a loop.

## Reduced motion

Not applicable — `useIdle` is a scheduling signal, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [rendering-recipes](./rendering-recipes.md) — sequencing work with `useIdle` and composing the rendering helpers
- [use-when-idle](./use-when-idle.md) — the effect form, for side effects (prefetch, `import()`) once idle
- [when-idle](./when-idle.md) — the mounting wrapper around `useIdle`
- [use-sight](./use-sight.md) — visibility-based gating instead of idle
