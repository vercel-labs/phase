# `useMediaQuery`

CSS media query subscription via the shared MQL pool. Returns `false` during SSR and initial hydration, then the live value.

## Signature

```ts
import { useMediaQuery } from 'phase/react';

const matches: boolean = useMediaQuery(query);
```

### Parameters

| Parameter | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `query`   | `string` | CSS media query string (e.g. `'(max-width: 600px)'`) |

### Return

`boolean` — whether the media query currently matches.

## When to use

- Subscribing to viewport-level or device-level media queries reactively.
- Dark mode detection: `useMediaQuery('(prefers-color-scheme: dark)')`.
- Reduced motion detection (reactive): `useMediaQuery('(prefers-reduced-motion: reduce)')`.
- Responsive logic that depends on viewport, not element size.

## When NOT to use — reach for X instead

| Instead of this                     | Use                                                  |
| ----------------------------------- | ---------------------------------------------------- |
| Element-level breakpoint            | `useContainerQuery` or `useSize`                     |
| One-shot reduced motion check       | `prefersReducedMotion()` (synchronous, non-reactive) |
| Animation gating for reduced motion | `useLoop` / `useLifecycle` — handle it automatically |
| CSS can do it                       | `@media` query in CSS — no JS needed                 |

## Do

- Use for conditional rendering based on viewport:
  ```tsx
  const isMobile = useMediaQuery('(max-width: 768px)');
  return isMobile ? <MobileNav /> : <DesktopNav />;
  ```
- Multiple `useMediaQuery` calls with the same query share one `MediaQueryList` (pooled).

## Don't

- **Don't use for element-level responsiveness** — media queries are viewport-scoped. Use `useContainerQuery`.
- **Don't rely on the initial `false`** — during SSR and hydration the value is `false`. Design fallback UI accordingly.

## Reduced motion

`useMediaQuery('(prefers-reduced-motion: reduce)')` is the reactive way to check reduced motion. But for animation primitives, you don't need this — all hooks handle it automatically.

## See also

- [useContainerQuery](./use-container-query.md) — element-level breakpoints
- [prefers-reduced-motion](./prefers-reduced-motion.md) — synchronous one-shot check
- [useSize](./use-size.md) — raw element dimensions
