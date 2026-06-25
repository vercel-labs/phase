# `createLifecycle`

The activation decision for an animation, decoupled from who drives the frames. Composes visibility (`createSight`), reduced motion, and a manual pause into a single `active` / `paused` phase.

## Signature

```ts
import { createLifecycle } from 'phase';

const lifecycle = createLifecycle(options: LifecycleOptions): Lifecycle;
```

### Options

| Option                | Type                                                       | Default   | Description                                 |
| --------------------- | ---------------------------------------------------------- | --------- | ------------------------------------------- |
| `element`             | `Element`                                                  | required  | Element to observe for visibility           |
| `reducedMotion`       | `'pause' \| 'ignore'`                                      | `'pause'` | Whether reduced motion pauses the lifecycle |
| `intersectionOptions` | `IntersectionObserverInit`                                 | —         | Forwarded to pooled IO                      |
| `start`               | `'auto' \| 'manual'`                                       | `'auto'`  | Whether to start immediately                |
| `onPhaseChange`       | `(phase: LifecyclePhase, reason: LifecycleReason) => void` | —         | Called on phase transitions                 |

### Return (Lifecycle)

| Property      | Type              | Description                                                                                    |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `start()`     | `() => void`      | Begin honoring signals (auto by default)                                                       |
| `stop()`      | `() => void`      | Terminal — disposes observers and listeners                                                    |
| `pause()`     | `() => void`      | Manual pause (lowest priority)                                                                 |
| `resume()`    | `() => void`      | Clear manual pause                                                                             |
| `phase`       | `LifecyclePhase`  | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason` | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |

## When to use

- You own your render loop (three.js, Pixi, WebGL, a Web Worker) and need phase's lifecycle guarantees without phase driving the clock.
- You want visibility pausing + reduced-motion pausing + manual pause composed into one signal.
- You need `pause()` / `resume()` for UI-driven suspension (e.g. a settings panel covering the animation).

## When NOT to use — reach for X instead

| Instead of this                          | Use                                              |
| ---------------------------------------- | ------------------------------------------------ |
| You want phase to drive the loop for you | `createLoop` — adds the ticker + quality signals |
| Just need visibility (no reduced motion) | `createSight` — simpler, no motion handling      |
| React component                          | `useLifecycle` — manages refs and teardown       |

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

## Don't

- **Don't use `pause()` to implement visibility pausing** — visibility is automatic via the internal `createSight`. Manual pause is for UI-driven scenarios only.
- **Don't call `start()` after `stop()`** — `stop()` is terminal.
- **Don't confuse with `createLoop`** — lifecycle gives you a signal; loop gives you a signal AND drives the frames.

## Reduced motion

Default: `'pause'` — the lifecycle reports `phase: 'paused'`, `phaseReason: 'reduced-motion'` when the user enables reduced motion. Your renderer should stop.

With `reducedMotion: 'ignore'`: lifecycle stays `active` regardless. Use only for non-decorative motion.

## See also

- [createLoop](./create-loop.md) — builds on createLifecycle; adds ticker, quality, frame budget
- [createSight](./create-sight.md) — pure visibility (no reduced motion handling)
- [useLifecycle](./use-lifecycle.md) — React hook wrapping createLifecycle
