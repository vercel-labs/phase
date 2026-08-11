# `createLifecycle`

The activation decision for an animation, decoupled from who drives the frames. Composes visibility (`createSight`), reduced motion, and a manual pause into a single `active` / `paused` phase.

## Signature

```ts
import { createLifecycle } from 'phase';

const lifecycle = createLifecycle(options: LifecycleOptions): Lifecycle;
```

### Options

| Option                | Type                                                       | Default   | Description                                                                            |
| --------------------- | ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `element`             | `Element`                                                  | required  | Element to observe for visibility                                                      |
| `reducedMotion`       | `'pause' \| 'ignore'`                                      | `'pause'` | Whether reduced motion pauses the lifecycle                                            |
| `intersectionOptions` | `IntersectionObserverInit`                                 | none      | Forwarded to pooled IO                                                                 |
| `start`               | `'auto' \| 'manual'`                                       | `'auto'`  | Whether to start immediately                                                           |
| `onPhaseChange`       | `(phase: LifecyclePhase, reason: LifecycleReason) => void` | none      | Called on phase transitions                                                            |
| `onVisibleChange`     | `(visible: boolean) => void`                               | none      | Raw sight signal, even when the phase swallows it (e.g. reduced motion outranks sight) |
| `signal`              | `AbortSignal`                                              | none      | Stops the lifecycle when the signal is aborted                                         |

### Return (Lifecycle)

| Property      | Type              | Description                                                                                    |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `start()`     | `() => void`      | Begin honoring signals (auto by default)                                                       |
| `stop()`      | `() => void`      | Terminal (disposes observers and listeners)                                                    |
| `pause()`     | `() => void`      | Manual pause (lowest priority)                                                                 |
| `resume()`    | `() => void`      | Clear manual pause                                                                             |
| `phase`       | `LifecyclePhase`  | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason` | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |
| `visible`     | `boolean`         | Current sight visibility, independent of the composed pause priority                           |

## When to use

- You own your render loop (three.js, Pixi, WebGL, a Web Worker) and need phase's lifecycle guarantees without phase driving the clock.
- You want visibility pausing + reduced-motion pausing + manual pause composed into one signal.
- You need `pause()` / `resume()` for UI-driven suspension (e.g. a settings panel covering the animation).

## When not to use

| Instead of this                          | Use                                              |
| ---------------------------------------- | ------------------------------------------------ |
| You want phase to drive the loop for you | `createLoop` (adds the ticker + quality signals) |
| Need visibility only (no reduced motion) | `createSight` (standalone, no motion handling)   |
| React component                          | `useLifecycle` (manages refs and teardown)       |

## Do

- React to `onPhaseChange` to start/stop your renderer:
  ```ts
  onPhaseChange: (phase) => {
    if (phase === 'active') renderer.start();
    else renderer.stop();
  };
  ```
- Use `pause()` / `resume()` for contextual suspension (modal open, panel covers animation).
- Trust pause priority: `reduced-motion` > `sight` > `manual`. If multiple pause reasons apply, the highest-priority one is reported.
- Gate a framework-free engine loaded via dynamic `import()`. Construct the lifecycle after the module resolves, drive the engine's imperative `start()` / `stop()` from `onPhaseChange`, and dispose both on teardown:

  ```ts
  let lifecycle: Lifecycle | undefined;
  let engine: ScrambleEngine | undefined;
  let cancelled = false;

  import('./scramble-engine').then(({ createScrambleEngine }) => {
    if (cancelled) return; // unmounted before the chunk loaded
    engine = createScrambleEngine(canvas);
    lifecycle = createLifecycle({
      element: canvas,
      onPhaseChange: (phase) => {
        if (phase === 'active') engine?.start();
        else engine?.stop();
      },
    });
  });

  // teardown:
  cancelled = true;
  lifecycle?.stop();
  engine?.dispose();
  ```

  The `cancelled` flag guards the async gap: if teardown runs before the chunk resolves, nothing is constructed. `createLifecycle` defaults to `start: 'auto'`, so it begins honoring signals the moment the engine exists.

## Don't

- **Don't use `pause()` to implement visibility pausing.** Visibility is automatic via the internal `createSight`. Manual pause is for UI-driven scenarios only.
- **Don't call `start()` after `stop()`.** `stop()` is terminal.
- **Don't confuse with `createLoop`.** Lifecycle gives you a signal; loop gives you a signal AND drives the frames.

## Reduced motion

Default: `'pause'`. The lifecycle reports `phase: 'paused'`, `phaseReason: 'reduced-motion'` when reduced motion is enabled. Your renderer should stop.

With `reducedMotion: 'ignore'`: lifecycle stays `active` regardless. Use only for non-decorative motion.

## See also

- [createLoop](./create-loop.md). Builds on createLifecycle; adds ticker, quality, frame budget
- [createSight](./create-sight.md). Pure visibility (no reduced motion handling)
- [useLifecycle](./use-lifecycle.md). React hook wrapping createLifecycle
- [abort-signals](./abort-signals.md). Stop this lifecycle via the `signal` option
