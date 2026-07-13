# `useMutation`

React hook wrapping `createMutation`. Lifecycle-aware MutationObserver with rAF-coalesced callbacks. Auto-pauses when the element is off-screen, tears down on unmount.

## Signature

Two overloads. When `onPhaseChange` is provided, `phase` and `phaseReason` are omitted from the return type (compile-time error to access them).

```ts
import { useMutation } from 'phase/react';

// Reactive (re-renders on phase transitions)
const { ref, phase, phaseReason, phaseRef, phaseReasonRef } =
  useMutation<T>(options);

// Transient (zero re-renders)
const { ref, phaseRef, phaseReasonRef } = useMutation<T>({
  ...options,
  onPhaseChange: (phase, reason) => {
    /* imperative work */
  },
});
```

### Options

| Option                | Type                                  | Default   | Description                                                              |
| --------------------- | ------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `ref`                 | `RefObject<T \| null>`                | returned  | Bring your own ref, or attach the returned one                           |
| `mutation`            | `MutationObserverInit`                | required  | Standard MutationObserver configuration (must be stable across renders)  |
| `onMutations`         | `(records: MutationRecord[]) => void` | required  | Called once per rAF frame with coalesced records                         |
| `onPhaseChange`       | `(phase, reason) => void`             | --        | When provided, no re-renders occur on phase transitions (transient mode) |
| `visibility`          | `'pause' \| 'ignore'`                 | `'pause'` | Pause observation when off-screen, or ignore visibility                  |
| `enabled`             | `boolean`                             | `true`    | When `false`, tears down the observer entirely                           |
| `intersectionOptions` | `IntersectionObserverInit`            | --        | Forwarded to the visibility observer                                     |

### Return (reactive, no `onPhaseChange`)

| Property         | Type                        | Description                                              |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`      | Attach to the observed element                           |
| `phase`          | `MutationPhase`             | `'observing' \| 'paused' \| 'stopped'`                   |
| `phaseReason`    | `MutationReason`            | `'initial' \| 'started' \| 'sight' \| 'disposed'`        |
| `phaseRef`       | `RefObject<MutationPhase>`  | Phase via ref. Always current, never triggers re-render  |
| `phaseReasonRef` | `RefObject<MutationReason>` | Reason via ref. Always current, never triggers re-render |

### Return (transient, with `onPhaseChange`)

| Property         | Type                        | Description                                              |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`      | Attach to the observed element                           |
| `phaseRef`       | `RefObject<MutationPhase>`  | Phase via ref. Always current, never triggers re-render  |
| `phaseReasonRef` | `RefObject<MutationReason>` | Reason via ref. Always current, never triggers re-render |

`phase` and `phaseReason` are not available in transient mode. Accessing them is a TypeScript error.

## When to use

- Reacting to DOM changes (child additions, attribute mutations) inside a React component.
- Syncing external DOM state into your component without reflow storms.
- Replacing raw `MutationObserver` usage in `useEffect` that lacks visibility pausing and rAF batching.
- Coalescing frequent mutations from animation libraries or framework churn into one callback per frame.

## When not to use

| Instead of this                            | Use                                          |
| ------------------------------------------ | -------------------------------------------- |
| Tracking element dimensions                | `useSize` (ResizeObserver, async, no reflow) |
| Viewport visibility as a boolean           | `useSight`                                   |
| Observing `style`/`class` across a subtree | Narrower signals or `useMediaQuery`          |
| Framework-agnostic code                    | `createMutation` (core)                      |

## Do

- Cleanup is automatic. The effect teardown disconnects the observer on unmount.
- Observe structural changes:
  ```tsx
  const { ref } = useMutation({
    mutation: { childList: true },
    onMutations: (records) => {
      const added = records.filter((r) => r.addedNodes.length > 0);
      countRef.current += added.length;
    },
  });
  return <ul ref={ref}>{items}</ul>;
  ```
- Use `onPhaseChange` for zero-re-render observation:
  ```tsx
  const { ref, phaseRef } = useMutation({
    mutation: { childList: true },
    onMutations: handleRecords,
    onPhaseChange: (phase) => {
      worker.postMessage({ observing: phase === 'observing' });
    },
  });
  ```
- Read `phaseRef.current` inside callbacks for the latest phase without closure staleness.

## Don't

- **Don't read layout inside `onMutations`.** Reading `getBoundingClientRect`, `offsetWidth`, or `getComputedStyle` forces a synchronous reflow even inside the rAF batch. Use `useSize` for dimensions.
- **Don't observe `subtree` + `attributeFilter: ['style', 'class']`.** Fires on every descendant style/class change. A dev-mode warning fires for this pattern.
- **Don't pass an unstable `mutation` object.** Define it outside the component or memoize it. Changes to the object are not tracked and will not restart the observer.

## Reduced motion

Not applicable. `useMutation` observes DOM changes, not animation.

## See also

- [createMutation](./create-mutation.md). Framework-agnostic core
- [useSight](./use-sight.md). Visibility observation (different signal)
- [useSize](./use-size.md). Dimension tracking via ResizeObserver
- [performance](./performance.md). Forced-reflow rules for observer callbacks
