# `createSight`

Reports whether an element is visible right now. Combines `document.visibilitychange`, `pageshow` (bfcache restore), and pooled `IntersectionObserver` into a single phase.

## Signature

```ts
import { createSight } from 'phase';

const sight = createSight(options: SightOptions): Sight;
```

### Options

| Option                | Type                                               | Default  | Description                                   |
| --------------------- | -------------------------------------------------- | -------- | --------------------------------------------- |
| `element`             | `Element`                                          | required | Element to observe                            |
| `intersectionOptions` | `IntersectionObserverInit`                         | —        | Forwarded to pooled IO                        |
| `onPhaseChange`       | `(phase: SightPhase, reason: SightReason) => void` | —        | Called on visibility transitions              |
| `signal`              | `AbortSignal`                                      | —        | Stops the observer when the signal is aborted |

### Return (Sight)

| Property      | Type          | Description                                                          |
| ------------- | ------------- | -------------------------------------------------------------------- |
| `phase`       | `SightPhase`  | `'unknown' \| 'visible' \| 'hidden'`                                 |
| `phaseReason` | `SightReason` | `'initial' \| 'viewport' \| 'document' \| 'bfcache' \| 'all-hidden'` |
| `stop()`      | `() => void`  | Dispose all listeners and observers                                  |

## When to use

- Lazy-mounting content when it enters the viewport.
- Analytics (tracking element impressions).
- Gating non-animation work (data loading, video playback).
- You need to know _why_ something became visible/hidden (viewport vs. tab switch vs. bfcache).

## When not to use

| Instead of this                               | Use                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| Gating an animation loop                      | `createLifecycle` (adds reduced-motion handling + manual pause) |
| React component that needs visibility boolean | `useSight`                                                      |
| Lazy-mount children on viewport entry         | `WhenVisible` component                                         |
| Intersection ratio (scroll progress)          | `createScrollProgress`                                          |

## Do

- Rely on observer pooling: 20 elements with the same `intersectionOptions` share one `IntersectionObserver` instance.
- Use `onPhaseChange` instead of polling `phase`. It fires only on transitions.
- Call `stop()` in cleanup to free the observer slot.

## Don't

- **Don't use for animations directly.** `createSight` doesn't know about reduced motion. For animation gating, use `createLifecycle` which composes sight + reduced motion.
- **Don't create raw `IntersectionObserver` instances.** Use `createSight` (or `createScrollProgress`) to benefit from the shared pool.
- **Don't call in SSR.** Throws `PhaseError` with code `server_context`.

## Reduced motion

`createSight` does not handle reduced motion. It reports pure visibility. If you need to gate an animation, use `createLifecycle` which folds in the reduced-motion signal.

## See also

- [createLifecycle](./create-lifecycle.md). Composes sight + reduced motion + manual pause
- [useSight](./use-sight.md). React hook wrapping createSight
- [createScrollProgress](./create-scroll-progress.md). Intersection ratio instead of boolean visibility
- [when-visible](./when-visible.md). React component for viewport-gated lazy mounting
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option
