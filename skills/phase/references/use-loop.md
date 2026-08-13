# `useLoop`

React binding for `createLoop`. It manages element attachment, teardown, callback freshness, and reactive/transient quality observation without per-frame renders.

## Usage

```tsx
const { ref, phase, quality, qualityRef } = useLoop({
  onTick: (frame) => {
    ref.current!.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
  },
});

return <div ref={ref} />;
```

### Options

| Option                | Type                       | Default      | Description                                  |
| --------------------- | -------------------------- | ------------ | -------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`     | returned     | Optional object ref                          |
| `onTick`              | `LoopTickFn`               | required     | Per-frame callback                           |
| `fps`                 | `number`                   | none         | Finite positive FPS cap                      |
| `enabled`             | `boolean`                  | `true`       | Tears down and reports idle when false       |
| `reducedMotion`       | `LoopReducedMotion`        | `'pause'`    | `'pause' \| 'ignore'`                        |
| `unfocused`           | `DegradedBehavior`         | `'pause'`    | Focus quality policy                         |
| `slowFrames`          | `DegradedBehavior`         | `'throttle'` | Shared frame-pressure policy                 |
| `throttleFps`         | `number`                   | `30`         | Throttle action cap                          |
| `intersectionOptions` | `IntersectionObserverInit` | none         | Visibility observer options                  |
| `onQualityChange`     | `QualityChangeCallback`    | none         | Selects transient quality mode when supplied |

### Reactive mode

Without `onQualityChange`, `UseLoopReactiveResult` returns:

- `ref`
- reactive `phase` / `phaseReason`
- reactive `quality`
- always-current `qualityRef`

Quality changes are infrequent state-machine transitions, not per-frame updates.

### Transient mode

Supplying `onQualityChange` returns `UseLoopTransientResult`. The reactive `quality` field is intentionally omitted from the type, quality changes do not render, and `qualityRef.current` remains current.

```tsx
const { ref, qualityRef } = useLoop({
  onTick,
  onQualityChange: (quality) => {
    worker.postMessage(quality);
  },
});
```

`UseLoopResult` remains as a deprecated alias for the reactive result.

## Ref lifecycle

Object refs do not notify React when `.current` changes. `useLoop` checks committed node identity and rebuilds only when that identity changes, so conditional mounts and replacement nodes attach correctly. Option changes and reconstruction reset quality before the new core loop reports transitions.

## Quality

`LoopQuality` reports all active quality signals and one `QualityAction`. It never exposes a singular reason that can disagree with the resolved action. See [createLoop](./create-loop.md#quality-state) for the state shape and [shared frame pressure](./create-loop.md#shared-frame-pressure) for browser timing semantics.

## Rules

- Never call `setState` or allocate intermediate objects in `onTick`.
- Never store `FrameState`; copy scalar fields you need later.
- Use `enabled` for React-controlled teardown/restart.
- Use `qualityRef` in asynchronous callbacks.

## See also

- [createLoop](./create-loop.md)
- [useCanvas](./use-canvas.md)
- [useLifecycle](./use-lifecycle.md)
