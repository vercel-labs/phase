# `useSyncedRef`

Ref whose `.current` is always the latest value, updated synchronously on every render. Readable from any callback or effect without triggering re-render.

## Signature

```ts
import { useSyncedRef } from 'phase/react';

const ref: RefObject<T> = useSyncedRef(value);
```

### Parameters

| Parameter | Type | Description               |
| --------- | ---- | ------------------------- |
| `value`   | `T`  | Any value to keep in sync |

### Return

`RefObject<T>` — `.current` is always the latest `value`.

## When to use

- Storing the latest version of a callback for use inside `onTick` / `draw` without restarting effects.
- Accessing the latest props/state from inside event handlers or effects with empty deps arrays.
- Internal use: `useLoop` and `useCanvas` use this internally to keep `onTick`/`draw` fresh.

## When NOT to use — reach for X instead

| Instead of this                         | Use                                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| Stable-identity callback for props/deps | `useStableCallback` — returns a callable function, not a ref   |
| DOM element ref                         | Standard `useRef` — `useSyncedRef` is for values, not elements |

## Do

- Use to avoid effect restarts when a callback changes:
  ```tsx
  const onTickRef = useSyncedRef(onTick);
  useEffect(() => {
    const id = setInterval(() => onTickRef.current(), 16);
    return () => clearInterval(id);
  }, []); // no deps on onTick — ref is always fresh
  ```

## Don't

- **Don't use in deps arrays** — the ref object identity is stable, so it won't trigger re-runs. Read `.current` inside the effect body instead.
- **Don't use for state that should trigger re-renders** — refs don't re-render. Use `useState` for reactive state.

## Reduced motion

Not applicable — utility hook, no animation behavior.

## See also

- [useStableCallback](./use-stable-callback.md) — stable-identity function (callable, not a ref)
- [useLoop](./use-loop.md) — uses useSyncedRef internally for onTick
