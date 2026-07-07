# `useDevicePixelRatio`

Reactive `devicePixelRatio` that updates when the window moves between monitors with different pixel densities.

## Signature

```ts
import { useDevicePixelRatio } from 'phase/react';

const dpr: number = useDevicePixelRatio();
```

No parameters. Returns `1` during SSR and initial hydration, then the live value.

## When to use

- Sizing a WebGL/canvas buffer when you own the renderer (not using `useCanvas`):
  ```tsx
  const dpr = useDevicePixelRatio();
  const { ref, size } = useSize();
  useEffect(() => {
    if (!size) return;
    const bufferWidth = size.width * Math.min(dpr, 2);
    const bufferHeight = size.height * Math.min(dpr, 2);
    renderer.setSize(bufferWidth, bufferHeight);
  }, [dpr, size]);
  ```
- Sending pixel dimensions to a worker that renders off-thread.
- Applying a DPR cap for performance on high-density mobile displays.

## When not to use

| Instead of this                        | Use                                                      |
| -------------------------------------- | -------------------------------------------------------- |
| Canvas animation with DPR-aware sizing | `useCanvas` handles DPR, buffer sizing, and context loss |
| Reading element CSS dimensions         | `useSize` (DPR is irrelevant for layout)                 |

## Do

- Apply a performance cap when the consumer's workload is GPU-heavy:
  ```ts
  const effectiveDpr = Math.min(dpr, 2);
  ```
- Combine with `useSize` for buffer sizing. `useSize` gives CSS dimensions, `useDevicePixelRatio` gives the multiplier.

## Don't

- **Don't read `window.devicePixelRatio` directly in a component.** It's not reactive and goes stale when the window moves between monitors.
- **Don't use this with `useCanvas`.** `useCanvas` manages DPR internally, including degraded-quality fallback to DPR 1.

## Internals

Uses a shared `matchMedia('(resolution: Xdppx)')` subscription that re-subscribes on every DPR change, so chained monitor switches (A -> B -> C) are all caught. Multiple callers share one subscription.

## Reduced motion

Not applicable. `useDevicePixelRatio` reports a display property, not animation.

## See also

- [create-device-pixel-ratio](./create-device-pixel-ratio.md). Framework-agnostic core
- [use-canvas](./use-canvas.md). DPR-aware canvas with automatic buffer sizing
- [use-size](./use-size.md). CSS element dimensions via ResizeObserver
- [use-lifecycle](./use-lifecycle.md). Common pairing for WebGL/worker renderers that need DPR + lifecycle
