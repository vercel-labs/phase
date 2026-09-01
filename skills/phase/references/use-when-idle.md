# `useWhenIdle`

Runs a callback once after `requestIdleCallback` when available or in the next task when it is not. The effect-shaped counterpart to `useIdle`, for non-critical side effects such as prefetching, cache warming, or `import()`, not rendering. The fallback may run before the browser is idle. The hook cancels on unmount and always calls the latest callback.

## Signature

```ts
import { useWhenIdle } from 'phase/react';

useWhenIdle(() => void import('./heavy-panel'), { timeout: 2000 });
```

### Arguments

| Argument   | Type          | Description                                      |
| ---------- | ------------- | ------------------------------------------------ |
| `callback` | `() => void`  | Runs once after idle scheduling or its fallback  |
| `options`  | `IdleOptions` | `{ timeout?: number }` — max ms to wait for idle |

## When to use

- Prefetch a code-split chunk so it is cached before the user needs it (`import()`).
- Warm a cache, hydrate a store, or start non-urgent network work.
- Side effects that can tolerate a next-task fallback when idle callbacks are unavailable.

## When not to use

| Instead of this                       | Use                           |
| ------------------------------------- | ----------------------------- |
| Rendering from the scheduled callback | `useIdle` (returns a boolean) |
| A one-off idle callback outside React | `whenIdle` (imperative core)  |
| Mounting from the scheduled callback  | `WhenIdle`                    |

## Do

- **Prefetch a heavy panel through idle scheduling:**
  ```tsx
  useWhenIdle(() => void import('./chat-panel-with-chat'));
  ```
- **Pass `timeout`** when the work should run even on a busy main thread within a bound.

## Don't

- **Don't use it to gate rendering.** It returns nothing. Use `useIdle` for a boolean you render from.
- **Don't add cleanup yourself.** The hook cancels on unmount automatically. Hand-rolled `requestIdleCallback` in a `useEffect` commonly forgets `cancelIdleCallback` (a leak) and the SSR guard; `useWhenIdle` handles both.

## Reduced motion

Not applicable. `useWhenIdle` is a scheduling primitive, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [use-idle](./use-idle.md). The boolean form of the same scheduling behavior
- [when-idle](./when-idle.md). Mount a subtree after idle scheduling or its fallback
- [rendering-recipes](./rendering-recipes.md). Prefetching and composing the rendering helpers
