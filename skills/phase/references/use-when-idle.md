# `useWhenIdle`

Runs a callback once, when the browser is idle after mount. The effect-shaped counterpart to `useIdle` — for side effects (prefetching, cache warming, `import()`), not rendering. Cancels on unmount and always calls the latest callback.

## Signature

```ts
import { useWhenIdle } from 'phase/react';

useWhenIdle(() => void import('./heavy-panel'), { timeout: 2000 });
```

### Arguments

| Argument   | Type          | Description                                      |
| ---------- | ------------- | ------------------------------------------------ |
| `callback` | `() => void`  | Runs once when the browser is idle after mount   |
| `options`  | `IdleOptions` | `{ timeout?: number }` — max ms to wait for idle |

## When to use

- Prefetch a code-split chunk so it is cached before the user needs it (`import()`).
- Warm a cache, hydrate a store, or kick off non-urgent network work after first paint.
- Any "do this when there's spare time" side effect that should not block the critical path.

## When NOT to use — reach for X instead

| Instead of this                       | Use                           |
| ------------------------------------- | ----------------------------- |
| Rendering something once idle         | `useIdle` (returns a boolean) |
| A one-off idle callback outside React | `whenIdle` (imperative core)  |
| Mounting a subtree when idle          | `WhenIdle`                    |

## Do

- **Prefetch a heavy panel during idle so it opens instantly later:**
  ```tsx
  useWhenIdle(() => void import('./chat-panel-with-chat'));
  ```
- **Pass `timeout`** when the work should run even on a busy main thread within a bound.

## Don't

- **Don't use it to gate rendering** — it returns nothing. Use `useIdle` for a boolean you render from.
- **Don't add cleanup yourself** — the hook cancels on unmount automatically. Hand-rolled `requestIdleCallback` in a `useEffect` commonly forgets `cancelIdleCallback` (a leak) and the SSR guard; `useWhenIdle` handles both.

## Reduced motion

Not applicable — `useWhenIdle` is a scheduling primitive, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [use-idle](./use-idle.md) — the boolean form, for rendering once idle
- [when-idle](./when-idle.md) — mount a subtree once idle
- [rendering-recipes](./rendering-recipes.md) — prefetching and composing the rendering helpers
