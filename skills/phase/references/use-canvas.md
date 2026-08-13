# `useCanvas`

Canvas binding for `createLoop` with exact physical sizing, adaptive resolution, ResizeObserver pooling, paused repainting, and context-loss recovery.

## Usage

```tsx
const result = useCanvas({
  containerRef,
  canvasRef,
  draw: (ctx, frame, size) => {
    ctx.clearRect(0, 0, size.width, size.height);
  },
});
```

### Options

| Option                | Type                                   | Default      | Description                                  |
| --------------------- | -------------------------------------- | ------------ | -------------------------------------------- |
| `containerRef`        | `RefObject<Element \| null>`           | required     | Visibility and sizing element                |
| `canvasRef`           | `RefObject<HTMLCanvasElement \| null>` | required     | Managed canvas                               |
| `draw`                | `CanvasDrawFn`                         | required     | Receives context, readonly frame, and `Size` |
| `fps`                 | `number`                               | none         | Finite positive FPS cap                      |
| `enabled`             | `boolean`                              | `true`       | Tear down while false                        |
| `reducedMotion`       | `LoopReducedMotion`                    | `'pause'`    | `'pause' \| 'ignore'`                        |
| `unfocused`           | `DegradedBehavior`                     | `'pause'`    | Focus policy                                 |
| `slowFrames`          | `DegradedBehavior`                     | `'throttle'` | Shared frame-pressure policy                 |
| `throttleFps`         | `number`                               | `30`         | Throttle action cap                          |
| `intersectionOptions` | `IntersectionObserverInit`             | none         | Visibility observer options                  |
| `pixelRatio`          | `'adaptive' \| 'device'`               | `'adaptive'` | Slow-frame resolution policy                 |
| `onQualityChange`     | `QualityChangeCallback`                | none         | Selects transient quality mode when supplied |

### Results

`UseCanvasReactiveResult` contains `restart`, reactive phase state, reactive `quality`, and always-current `qualityRef`.

Supplying `onQualityChange` returns `UseCanvasTransientResult`: `quality` is omitted and only `qualityRef` updates. `UseCanvasResult` is a deprecated alias for the reactive result.

## Buffer sizing

- Uses `devicePixelContentBoxSize` when available.
- Falls back to rounded CSS size multiplied by device DPR.
- Scales each axis by actual physical pixels divided by CSS pixels, covering fractional layout exactly.
- Skips identical width/height writes because every assignment clears the bitmap.
- Tracks committed ref identity, including late mounts and replacement nodes.

## Adaptive resolution

`pixelRatio: 'adaptive'` uses a 1x backing buffer while `quality.signals.slowFrames` is `'degraded'` or `'probing'`. It restores device resolution only after healthy recovery is confirmed.

Focus throttling never changes resolution. FPS policy and image resolution are separate decisions. Use `'device'` when exact resolution must never adapt.

## Paused repainting

Canvas width/height writes and context restoration clear the bitmap. `useCanvas` copies the four frame scalars into a preallocated repaint frame after each delivered tick, then redraws that state when a visible paused canvas buffer is recreated.

If reduced motion is active before any frame:

1. Offscreen sizing is cached without allocating or drawing.
2. Visibility creates the buffer.
3. One zero-timeline static frame is drawn.

This prevents blank canvases without doing hidden work. `draw` can therefore run outside rAF after resize, context restoration, or a visibility transition.

## Observer composition

The ResizeObserver pool supports duplicate callback identities as independent subscriptions, releases empty entries, and keeps different box options on independent native observers. Sharing a container with `useSize` no longer clobbers either subscription.

## Rules

- Draw in CSS pixels; the context transform already maps to the exact buffer.
- Never call React `setState` or allocate intermediate objects in `draw`.
- Do not assign canvas width/height or call `getBoundingClientRect()` yourself.
- Give the canvas fallback text or an accessible name when it conveys information.

## See also

- [useLoop](./use-loop.md)
- [createLoop](./create-loop.md)
- [useDevicePixelRatio](./use-device-pixel-ratio.md)
