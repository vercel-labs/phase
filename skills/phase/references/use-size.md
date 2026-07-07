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

## When not to use

| Instead of this                         | Use                                                     |
| --------------------------------------- | ------------------------------------------------------- |
| Breakpoint matching (only need boolean) | `useContainerQuery` (re-renders only on boundary cross) |
| Viewport size                           | CSS viewport units or `window.innerWidth`               |
| Canvas sizing                           | `useCanvas` (handles resize internally)                 |

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

- **Don't use `getBoundingClientRect()` as a fallback.** It forces a synchronous reflow. Trust the async RO callback.
- **Don't use when you only need a breakpoint boolean.** `useContainerQuery` re-renders less often.
- **Don't expect updates inside a skipped `Defer` subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside `content-visibility: auto` subtrees that the browser has skipped. Size observations resume when the element scrolls back into view. This is spec behavior across all browsers, not a bug. If you need to detect the skip/unskip transition, use `useRenderState`.

## Reduced motion

Not applicable. `useSize` reports dimensions, not animation.

## See also

- [useContainerQuery](./use-container-query.md). Breakpoint matching (fewer re-renders)
- [useCanvas](./use-canvas.md). Canvas sizing handled automatically
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Multiply CSS dimensions by DPR for buffer sizing
- [useScrollProgress](./use-scroll-progress.md). Visibility ratio, not dimensions
