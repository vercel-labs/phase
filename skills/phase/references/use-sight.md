# `useSight`

Element visibility as a phase (`visible` / `hidden`). Wraps `createSight` with React lifecycle management.

## Signature

Two overloads. When `onVisibilityChange` is provided, `phase` and `phaseReason` are omitted from the return type (compile-time error to access them).

```ts
import { useSight } from 'phase/react';

// Reactive (re-renders on visibility transitions)
const { ref, phase, phaseReason, phaseRef, phaseReasonRef } = useSight<T>(options?);

// Transient (zero re-renders)
const { ref, phaseRef, phaseReasonRef } = useSight<T>({
  onVisibilityChange: (phase, reason) => { /* imperative work */ },
});
```

### Options

| Option               | Type                                               | Default        | Description                                                                                            |
| -------------------- | -------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `ref`                | `RefObject<T \| null>`                             | returned       | Bring your own ref                                                                                     |
| `observe`            | `'continuous' \| 'once'`                           | `'continuous'` | `'once'` freezes at `'visible'` after first intersection                                               |
| `root`               | `Element \| null`                                  | —              | IO root element                                                                                        |
| `rootMargin`         | `string`                                           | —              | IO root margin                                                                                         |
| `threshold`          | `number \| number[]`                               | —              | IO threshold                                                                                           |
| `onVisibilityChange` | `(phase: SightPhase, reason: SightReason) => void` | —              | Called on every visibility transition. When provided, `phase`/`phaseReason` are omitted, no re-renders |

### Return (reactive, no `onVisibilityChange`)

| Property         | Type                     | Description                                                          |
| ---------------- | ------------------------ | -------------------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`   | Attach to the observed element                                       |
| `phase`          | `SightPhase`             | `'unknown' \| 'visible' \| 'hidden'`                                 |
| `phaseReason`    | `SightReason`            | `'initial' \| 'viewport' \| 'document' \| 'bfcache' \| 'all-hidden'` |
| `phaseRef`       | `RefObject<SightPhase>`  | Visibility phase via ref. Always current, never triggers re-render   |
| `phaseReasonRef` | `RefObject<SightReason>` | Phase reason via ref. Always current, never triggers re-render       |

### Return (transient, with `onVisibilityChange`)

| Property         | Type                     | Description                                                        |
| ---------------- | ------------------------ | ------------------------------------------------------------------ |
| `ref`            | `RefObject<T \| null>`   | Attach to the observed element                                     |
| `phaseRef`       | `RefObject<SightPhase>`  | Visibility phase via ref. Always current, never triggers re-render |
| `phaseReasonRef` | `RefObject<SightReason>` | Phase reason via ref. Always current, never triggers re-render     |

`phase` and `phaseReason` are not available in transient mode. Accessing them is a TypeScript error.

## When to use

- Lazy-mounting content on viewport entry (analytics, video playback, data loading).
- Tracking impressions.
- Conditionally rendering based on visibility (not animation gating; use `useLifecycle` for that).
- `observe: 'once'` for one-shot triggers (load data when first visible, never unload).
- **With `onVisibilityChange`**: observing many elements or gating imperative work without re-renders.

## When not to use

| Instead of this                                | Use                                                 |
| ---------------------------------------------- | --------------------------------------------------- |
| Gating an animation loop                       | `useLifecycle` (adds reduced motion + manual pause) |
| Viewport-gated lazy mount with enter animation | `WhenVisible` component                             |
| Intersection ratio (scroll progress)           | `useScrollProgress`                                 |

## Do

- Cleanup is automatic. The observer is disconnected on unmount.
- Use `observe: 'once'` for triggers that should never reverse:
  ```tsx
  const { ref, phase } = useSight({ observe: 'once' });
  if (phase === 'visible') loadData();
  ```
- Use `onVisibilityChange` for zero-re-render observation:
  ```tsx
  const { ref, phaseRef } = useSight({
    onVisibilityChange: (phase) => {
      worker.postMessage({ visible: phase === 'visible' });
    },
  });
  ```
- Read `phaseRef.current` inside callbacks for the latest visibility without closure staleness.
- Check `phaseReason` (or `phaseReasonRef`) to distinguish viewport leave from tab switch.

## Don't

- **Don't use for animation gating.** `useSight` doesn't know about reduced motion. Use `useLifecycle`.
- **Don't create raw `IntersectionObserver`.** `useSight` uses the pooled IO automatically.

## Reduced motion

Not applicable. `useSight` reports pure visibility. If using it to gate animation, switch to `useLifecycle`.

## See also

- [useLifecycle](./use-lifecycle.md). Visibility + reduced motion + manual pause for animation gating
- [when-visible](./when-visible.md). Declarative one-shot viewport lazy mount
- [useScrollProgress](./use-scroll-progress.md). Intersection ratio (0–1)
- [createSight](./create-sight.md). Framework-agnostic core
