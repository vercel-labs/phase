# `useStableCallback`

Returns a function with stable identity that always calls the latest version of `callback`. Safe in deps arrays and as a prop to `memo()`'d children.

## Signature

```ts
import { useStableCallback } from 'phase/react';

const stable = useStableCallback(callback);
```

### Parameters

| Parameter  | Type                   | Description               |
| ---------- | ---------------------- | ------------------------- |
| `callback` | `(...args: Args) => R` | The function to stabilize |

### Return

`(...args: Args) => R` — same signature, stable identity across renders.

## When to use

- Passing callbacks to memoized children without breaking `React.memo`.
- Using callbacks in effect deps without causing re-runs.
- Event handlers that need latest closure values but stable identity.

## When not to use

| Instead of this                   | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| Per-frame callback (onTick, draw) | `useSyncedRef` (phase hooks use it internally, no consumer action needed) |
| Simple memoized value             | `useMemo` / `useCallback` with proper deps                                |

## Do

- Use for stable props to memoized children:
  ```tsx
  const handleClick = useStableCallback(() => {
    console.log(latestCount); // always fresh
  });
  return <MemoizedButton onClick={handleClick} />;
  ```

## Don't

- **Don't use for `onTick`/`draw`.** Phase hooks already sync these via `useSyncedRef` internally. Adding `useStableCallback` on top is redundant.
- **Don't use where React's `useCallback` with proper deps suffices.** Only reach for this when deps would be unstable or numerous.

## Reduced motion

Not applicable. Utility hook, no animation behavior.

## See also

- [useSyncedRef](./use-synced-ref.md). Ref-based value sync (used internally by phase hooks)
- [useLoop](./use-loop.md). Uses useSyncedRef for onTick automatically
