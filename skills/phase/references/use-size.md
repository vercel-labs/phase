# `useSize`

Element dimensions via the shared ResizeObserver pool. Subscribers with the same box type share an observer; different box types stay independent. Never calls `getBoundingClientRect()`.

## Signature

Two overloads. When `onResize` is provided, `size` is omitted from the return type (compile-time error to access it).

```ts
import { useSize } from 'phase/react';

// Reactive (re-renders on resize)
const { ref, size, sizeRef } = useSize<T>(options?);

// Transient (zero re-renders)
const { ref, sizeRef } = useSize<T>({ onResize: (s) => applySize(s) });
```

### Options

| Option     | Type                            | Default         | Description                                                                                                  |
| ---------- | ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `ref`      | `RefObject<T \| null>`          | returned        | Bring your own ref                                                                                           |
| `box`      | `'content-box' \| 'border-box'` | `'content-box'` | Which CSS box model to measure. Controls both the observation trigger and which size is read from the entry. |
| `onResize` | `(size: Size) => void`          | —               | Called on every resize. When provided, `size` is omitted from the return type, no re-renders                 |

### Return (reactive, no `onResize`)

| Property  | Type                      | Description                                                 |
| --------- | ------------------------- | ----------------------------------------------------------- |
| `ref`     | `RefObject<T \| null>`    | Attach to the measured element                              |
| `size`    | `Size \| null`            | `{ width, height }` or `null` until first observation       |
| `sizeRef` | `RefObject<Size \| null>` | Always-current dimensions via ref. Never triggers re-render |

### Return (transient, with `onResize`)

| Property  | Type                      | Description                                                 |
| --------- | ------------------------- | ----------------------------------------------------------- |
| `ref`     | `RefObject<T \| null>`    | Attach to the measured element                              |
| `sizeRef` | `RefObject<Size \| null>` | Always-current dimensions via ref. Never triggers re-render |

`size` is not available in transient mode. Accessing it is a TypeScript error.

## When to use

- Reading element dimensions without forced reflows.
- Responsive logic based on actual element size (not viewport).
- Feeding dimensions to canvas sizing, layout calculations, or animations.
- Tracking full visual bounds (content + padding + border) for 3D overlays, coordinate mapping, or positioning with `box: 'border-box'`.
- **With `onResize`**: imperative consumers (canvas, WebGL, animation loops) that need size without re-renders.

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

- Use `box: 'border-box'` when you need the element's full painted bounds (content + padding + border), for example to overlay a canvas or 3D layer on a DOM element:

  ```tsx
  const { ref, size } = useSize({ box: 'border-box' });
  ```

- Use `onResize` for zero-re-render canvas/animation sizing:

  ```tsx
  const { ref, sizeRef } = useSize({
    onResize: (size) => {
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
    },
  });
  ```

- Read `sizeRef.current` inside `onTick`/`draw` callbacks for the latest dimensions without closure staleness.
- Re-renders only when dimensions actually change (deduped internally).
- `box` also controls the ResizeObserver trigger. With `'border-box'`, padding and border changes fire the callback even when content size is unchanged.

## Don't

- **Don't use `getBoundingClientRect()` as a fallback.** It forces a synchronous reflow. Trust the async RO callback.
- **Don't use when you only need a breakpoint boolean.** `useContainerQuery` re-renders less often.
- **Don't read `size` when `onResize` is provided.** The type omits it to prevent this, but the intent: in transient mode, read from `sizeRef` or use the callback value.
- **Don't use `useSize` for viewport-relative position tracking.** ResizeObserver reports dimensions, not coordinates. Mapping a DOM element into a WebGL/3D scene requires `getBoundingClientRect()` (a synchronous layout query) triggered on scroll or window resize. That's a controlled cost the consumer should own in a custom hook, not something phase wraps.
- **Don't expect updates inside a skipped `Defer` subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside `content-visibility: auto` subtrees that the browser has skipped. Size observations resume when the element scrolls back into view. This is spec behavior across all browsers, not a bug. If you need to detect the skip/unskip transition, use `useRenderState`.

## Reduced motion

Not applicable. `useSize` reports dimensions, not animation.

## See also

- [useContainerQuery](./use-container-query.md). Breakpoint matching (fewer re-renders)
- [useCanvas](./use-canvas.md). Canvas sizing handled automatically
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Multiply CSS dimensions by DPR for buffer sizing
- [useScrollProgress](./use-scroll-progress.md). Visibility ratio, not dimensions
