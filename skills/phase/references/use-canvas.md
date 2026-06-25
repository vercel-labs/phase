# `useCanvas`

Everything `useLoop` provides, plus DPR-aware buffer sizing, ResizeObserver coalescing, and GPU context loss recovery.

## Signature

```ts
import { useCanvas } from 'phase/react';

const { restart, phase, phaseReason, quality, qualityReason } =
  useCanvas(options);
```

### Options

| Option          | Type                                                                     | Default      | Description                                  |
| --------------- | ------------------------------------------------------------------------ | ------------ | -------------------------------------------- |
| `containerRef`  | `RefObject<Element \| null>`                                             | required     | Element that determines canvas size          |
| `canvasRef`     | `RefObject<HTMLCanvasElement \| null>`                                   | required     | The `<canvas>` element                       |
| `draw`          | `(ctx: CanvasRenderingContext2D, frame: FrameState, size: Size) => void` | required     | Called every frame                           |
| `fps`           | `number`                                                                 | —            | Cap frames per second                        |
| `enabled`       | `boolean`                                                                | `true`       | When `false`, tears down everything          |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'`                                      | `'pause'`    | Behavior under reduced motion                |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'`                                      | `'throttle'` | For heavy GPU work, `'pause'` is often right |
| `degradedFps`   | `number`                                                                 | `30`         | FPS cap in degraded throttle mode            |

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

## When NOT to use — reach for X instead

| Instead of this                        | Use                                     |
| -------------------------------------- | --------------------------------------- |
| DOM transforms (not canvas)            | `useLoop` — simpler, no canvas concerns |
| WebGL via three.js/Pixi (own renderer) | `useLifecycle` + your renderer's loop   |
| Static canvas (draw once)              | One-shot `useEffect` with canvas API    |

## Do

- Cleanup is automatic — the effect teardown stops the loop, unobserves resize, and removes context-loss listeners on unmount.
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
- Draw in CSS pixels — `ctx` is already scaled for `devicePixelRatio`.
- Use `degraded: 'pause'` for heavy GPU work that can't gracefully degrade.
- Read `quality` to adapt rendering (fewer particles, simpler shaders).

## Don't

- **Never call `setState` inside `draw`** — same rule as `onTick`.
- **Never allocate inside `draw`** — zero-allocation contract applies.
- **Don't call `canvas.getContext('2d')` yourself** — `useCanvas` manages the context.
- **Don't manually set `canvas.width`/`canvas.height`** — handled by the resize system.
- **Don't use `getBoundingClientRect()` for sizing** — uses ResizeObserver (async, no reflow).

## Reduced motion

Default `'pause'`: canvas stops rendering. Consider `'pause'` over `'complete'` for canvas since there's no single "end state" to jump to.

## See also

- [useLoop](./use-loop.md) — DOM animation variant (no canvas concerns)
- [useLifecycle](./use-lifecycle.md) — use with three.js/Pixi where you own the renderer
- [createLoop](./create-loop.md) — framework-agnostic core
