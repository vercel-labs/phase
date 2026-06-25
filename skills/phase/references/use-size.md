# `useSize`

Element dimensions via the shared ResizeObserver singleton. Never calls `getBoundingClientRect()`.

## Signature

```ts
import { useSize } from 'phase/react';

const { ref, size } = useSize<T>(options?);
```

### Options

| Option | Type                   | Default  | Description        |
| ------ | ---------------------- | -------- | ------------------ |
| `ref`  | `RefObject<T \| null>` | returned | Bring your own ref |

### Return

| Property | Type                   | Description                                           |
| -------- | ---------------------- | ----------------------------------------------------- |
| `ref`    | `RefObject<T \| null>` | Attach to the measured element                        |
| `size`   | `Size \| null`         | `{ width, height }` or `null` until first observation |

## When to use

- Reading element dimensions without forced reflows.
- Responsive logic based on actual element size (not viewport).
- Feeding dimensions to canvas sizing, layout calculations, or animations.

## When NOT to use — reach for X instead

| Instead of this                         | Use                                                     |
| --------------------------------------- | ------------------------------------------------------- |
| Breakpoint matching (only need boolean) | `useContainerQuery` — re-renders only on boundary cross |
| Viewport size                           | CSS viewport units or `window.innerWidth`               |
| Canvas sizing                           | `useCanvas` — handles resize internally                 |

## Do

- Use for dimension-aware rendering:
  ```tsx
  const { ref, size } = useSize();
  return (
    <div ref={ref}>
      {size ? `${size.width}x${size.height}` : 'measuring...'}
    </div>
  );
  ```
- Re-renders only when dimensions actually change (deduped internally).

## Don't

- **Don't use `getBoundingClientRect()` as a fallback** — it forces a synchronous reflow. Trust the async RO callback.
- **Don't use when you only need a breakpoint boolean** — `useContainerQuery` re-renders less often.

## Reduced motion

Not applicable — `useSize` reports dimensions, not animation.

## See also

- [useContainerQuery](./use-container-query.md) — breakpoint matching (fewer re-renders)
- [useCanvas](./use-canvas.md) — canvas sizing handled automatically
- [useScrollProgress](./use-scroll-progress.md) — visibility ratio, not dimensions
