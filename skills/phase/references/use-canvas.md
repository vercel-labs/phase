# `useCanvas`

Everything `useLoop` provides, plus DPR-aware buffer sizing, ResizeObserver coalescing, and GPU context loss recovery.

## Signature

```ts
import { useCanvas } from 'phase/react';

const { restart, phase, phaseReason, quality, qualityReason } =
  useCanvas(options);
```

### Options

| Option          | Type                                   | Default      | Description                                  |
| --------------- | -------------------------------------- | ------------ | -------------------------------------------- |
| `containerRef`  | `RefObject<Element \| null>`           | required     | Element that determines canvas size          |
| `canvasRef`     | `RefObject<HTMLCanvasElement \| null>` | required     | The `<canvas>` element                       |
| `draw`          | `CanvasDrawFn`                         | required     | Called every frame                           |
| `fps`           | `number`                               | —            | Cap frames per second                        |
| `enabled`       | `boolean`                              | `true`       | When `false`, tears down everything          |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'`    | `'pause'`    | Behavior under reduced motion                |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'`    | `'throttle'` | For heavy GPU work, `'pause'` is often right |
| `degradedFps`   | `number`                               | `30`         | FPS cap in degraded throttle mode            |

### Return

| Property        | Type                          | Description                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| `restart`       | `() => void`                  | Tear down and rebuild (e.g. after config change) |
| `phase`         | `LoopPhase`                   | Current loop phase                               |
| `phaseReason`   | `LoopReason`                  | Why                                              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                           |
| `qualityReason` | `DegradedReason \| undefined` | Why quality degraded                             |

## When to use

- 2D canvas animations (particles, data viz, generative art).
- You need DPR-aware sizing (retina displays, multi-monitor drag).
- You want GPU context loss handled automatically (mobile tab eviction).
- Container-driven sizing (canvas fills its parent, not the viewport).

## When not to use

| Instead of this                        | Use                                   |
| -------------------------------------- | ------------------------------------- |
| DOM transforms (not canvas)            | `useLoop` (no canvas concerns)        |
| WebGL via three.js/Pixi (own renderer) | `useLifecycle` + your renderer's loop |
| Static canvas (draw once)              | One-shot `useEffect` with canvas API  |

## Do

- Cleanup is automatic. The effect teardown stops the loop, unobserves resize, and removes context-loss listeners on unmount.
- Pass two refs (container + canvas):
  ```tsx
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  useCanvas({ containerRef, canvasRef, draw });
  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
  ```
- Extract `draw` to a named function using the exported `CanvasDrawFn` type: `const draw: CanvasDrawFn = (ctx, frame, size) => { ... }`.
- Draw in CSS pixels. `ctx` is already scaled for `devicePixelRatio`. DPR changes (e.g. dragging between monitors) are tracked reactively, including chained switches (A -> B -> C).
- Use `degraded: 'pause'` for heavy GPU work that can't gracefully degrade.
- Read `quality` to adapt rendering (fewer particles, simpler shaders).
- For 3D overlays on DOM elements, pair with `useSize({ box: 'border-box' })` for the target element's dimensions. Use a separate container for the canvas (the RO pool allows one observer per element, so sharing a ref between `useSize` and `useCanvas` would clobber one subscription). If you also need viewport-relative position (DOM-to-WebGL coordinate mapping), that requires `getBoundingClientRect()` on scroll/resize in a custom hook, since no async observer exists for element position:

  ```tsx
  const targetRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const { size } = useSize({ ref: targetRef, box: 'border-box' });
  useCanvas({ containerRef: canvasContainerRef, canvasRef, draw });
  ```

## Don't

- **Never write state that changes on every frame inside `draw`.** React may re-render on every tick. A one-time update is allowed only if the callback sets a guard before the update and also sets `enabled` to `false`.
- **Never allocate inside `draw`.** Zero-allocation contract applies.
- **Don't call `canvas.getContext('2d')` yourself.** `useCanvas` manages the context.
- **Don't manually set `canvas.width`/`canvas.height`.** Handled by the resize system.
- **Don't use `getBoundingClientRect()` for sizing.** Uses ResizeObserver (async, no reflow).

## Reduced motion

Default `'pause'`: canvas stops rendering. Consider `'pause'` over `'complete'` for canvas since there's no single "end state" to jump to.

## See also

- [useLoop](./use-loop.md). DOM animation variant (no canvas concerns)
- [useLifecycle](./use-lifecycle.md). Use with three.js/Pixi where you own the renderer
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Reactive DPR for renderers outside `useCanvas`
- [createLoop](./create-loop.md). Framework-agnostic core
