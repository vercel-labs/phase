# `createLoop`

The main core primitive. It combines a persistent ticker, visibility, reduced motion, focus, and shared frame-pressure state.

## Signature

```ts
import { createLoop } from 'phase';

const loop = createLoop(options);
```

### Options

| Option                | Type                          | Default      | Description                                       |
| --------------------- | ----------------------------- | ------------ | ------------------------------------------------- |
| `element`             | `Element`                     | required     | Element observed for visibility                   |
| `onTick`              | `(frame: FrameState) => void` | required     | Called for each delivered frame                   |
| `fps`                 | `number`                      | none         | Finite positive cap; `undefined` uses display rAF |
| `reducedMotion`       | `LoopReducedMotion`           | `'pause'`    | `'pause' \| 'ignore'`                             |
| `unfocused`           | `DegradedBehavior`            | `'pause'`    | Behavior while `document.hasFocus()` is false     |
| `slowFrames`          | `DegradedBehavior`            | `'throttle'` | Behavior under shared frame pressure              |
| `throttleFps`         | `number`                      | `30`         | Finite positive cap for a throttle action         |
| `intersectionOptions` | `IntersectionObserverInit`    | none         | Forwarded to the pooled visibility observer       |
| `start`               | `'auto' \| 'manual'`          | `'auto'`     | Whether signal reconciliation starts immediately  |
| `onPhaseChange`       | `(phase, reason) => void`     | none         | Called after a completed phase transition         |
| `onQualityChange`     | `QualityChangeCallback`       | none         | Called after a completed quality transition       |
| `signal`              | `AbortSignal`                 | none         | Stops the loop when aborted                       |

`DegradedBehavior` is `'pause' | 'throttle' | 'ignore'`. Pause wins over throttle, which wins over ignore.

### Return

| Property      | Type          | Description                                                                   |
| ------------- | ------------- | ----------------------------------------------------------------------------- |
| `start()`     | `() => void`  | Start once; repeated calls are no-ops                                         |
| `stop()`      | `() => void`  | Terminal teardown                                                             |
| `phase`       | `LoopPhase`   | `'idle' \| 'running' \| 'paused' \| 'stopped'`                                |
| `phaseReason` | `LoopReason`  | Includes `'sight'`, `'reduced-motion'`, `'unfocused'`, and `'slow-frames'`    |
| `quality`     | `LoopQuality` | One immutable snapshot containing every active signal and the resolved action |

## Quality state

`LoopQuality` is a discriminated snapshot:

```ts
type LoopQuality =
  | {
      status: 'full';
      signals: { unfocused: false; slowFrames: undefined };
      action: undefined;
    }
  | {
      status: 'degraded';
      signals: {
        unfocused: boolean;
        slowFrames: 'degraded' | 'probing' | undefined;
      };
      action: QualityAction;
    };
```

`QualityAction` is `{ behavior: 'pause' }`, `{ behavior: 'ignore' }`, or `{ behavior: 'throttle'; fps: number }`. This preserves overlapping causes instead of selecting one misleading reason.

### Shared frame pressure

`slowFrames` is page-level rAF pressure, not per-loop GPU attribution. The shared clock:

1. Learns the source display cadence before classifying pressure.
2. Distinguishes stable low-work cadence shifts (30 Hz displays, monitor changes, VRR) from irregular missed opportunities.
3. Samples aggregate main-thread occupancy once after shared callback dispatch.
4. Requires sustained pressure before degrading.
5. Uses one detector and one retry timer for every loop.

The browser does not expose portable per-loop GPU, layout, or paint timing. Do not interpret this signal as proof that one callback caused a slow frame.

After two seconds, quality enters `'probing'`, remains degraded, and temporarily removes slow-frame mitigation. Thirty healthy frames confirm recovery. A failed probe returns directly to `'degraded'` without publishing a false `'full'` transition.

Only started loops eligible to execute register for pressure. Sight, reduced-motion pause, and focus pause unregister before strong pause; the final unregister cancels recovery and discards stale cadence. A loop paused by pressure stays registered so its shared recovery probe can resume it.

## Timeline guarantees

One ticker owns `FrameState` for the loop's entire life. `setFps()` mutates its deadline gate without rebuilding:

- `elapsed` excludes strong pauses and never catches up after blur/offscreen time.
- `delta` includes skipped running frames and is clamped to 40 ms.
- `frame` and object identity continue through throttle changes.
- The first frame after start or resume is immediate with a clean default delta.

## Callback and teardown guarantees

Internal phase, FPS, and quality state is coherent before consumer callbacks run. Teardown completes before the stopped callback. If an automatic construction callback throws, all observers, listeners, and ticker subscriptions are disposed before the error escapes.

Callbacks may run synchronously with `start: 'auto'`, so do not reference an unassigned loop variable without a guard.

## Reduced motion

The default `'pause'` is a strong pause: zero scheduling and zero loop callbacks. Sight outranks reduced motion while an element is hidden, so static canvas work is deferred until the element becomes visible. Open-ended loops have no `'complete'` state; use `useTween` for a finite target.

## Do

- Write directly to refs, DOM, or a canvas inside `onTick`.
- Read `loop.quality.signals` to identify all active adaptive signals.
- Read `loop.quality.action` to understand actual execution.
- Call `stop()` for terminal cleanup.

## Don't

- Do not allocate intermediate objects or call React `setState` in `onTick`.
- Do not store `FrameState`; it is a readonly view of one reused object.
- Do not pass zero, negative, `NaN`, or infinite FPS values. They throw `PhaseError` with `invalid_fps`.
- Do not call `start()` after `stop()`.

## See also

- [createTicker](./create-ticker.md)
- [createLifecycle](./create-lifecycle.md)
- [useLoop](./use-loop.md)
- [useCanvas](./use-canvas.md)
