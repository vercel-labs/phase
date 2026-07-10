# `useMutation`

React hook wrapping `createMutation`. Lifecycle-aware MutationObserver with rAF-coalesced callbacks. Auto-pauses when the element is off-screen, tears down on unmount.

## Signature

```ts
import { useMutation } from 'phase/react';

const { ref, phase, phaseReason } = useMutation<T>(options);
```

### Options

| Option                | Type                                  | Default  | Description                                      |
| --------------------- | ------------------------------------- | -------- | ------------------------------------------------ |
| `ref`                 | `RefObject<T \| null>`                | returned | Bring your own ref, or attach the returned one   |
| `mutation`            | `MutationObserverInit`                | required | Standard MutationObserver configuration          |
| `onMutations`         | `(records: MutationRecord[]) => void` | required | Called once per rAF frame with coalesced records |
| `visibilityAware`     | `boolean`                             | `true`   | Pause observation while off-screen               |
| `enabled`             | `boolean`                             | `true`   | When `false`, tears down the observer            |
| `intersectionOptions` | `IntersectionObserverInit`            | --       | Forwarded to the visibility observer             |

### Return

| Property      | Type                   | Description                            |
| ------------- | ---------------------- | -------------------------------------- |
| `ref`         | `RefObject<T \| null>` | Attach to the observed element         |
| `phase`       | `MutationPhase`        | `'observing' \| 'paused' \| 'stopped'` |
| `phaseReason` | `MutationReason`       | Why the current phase was entered      |

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
- Observe a specific attribute:
  ```tsx
  const { ref } = useMutation({
    mutation: { attributes: true, attributeFilter: ['data-state'] },
    onMutations: (records) => syncExternalState(records),
  });
  ```
- Use `enabled` to conditionally observe:
  ```tsx
  useMutation({
    ref,
    mutation: { childList: true },
    onMutations: handleChanges,
    enabled: isPanelOpen,
  });
  ```

## Don't

- **Don't read layout inside `onMutations`.** Reading `getBoundingClientRect`, `offsetWidth`, or `getComputedStyle` forces a synchronous reflow even inside the rAF batch. Use `useSize` for dimensions.
- **Don't observe `subtree` + `attributeFilter: ['style', 'class']`.** Fires on every descendant style/class change. A dev-mode warning fires for this pattern.
- **Don't use `useMutation` where `useSize` or `useSight` fits.** Those hooks use pooled observers optimized for their specific signal.

## Reduced motion

Not applicable. `useMutation` observes DOM changes, not animation.

## See also

- [createMutation](./create-mutation.md). Framework-agnostic core
- [useSight](./use-sight.md). Visibility observation (different signal)
- [useSize](./use-size.md). Dimension tracking via ResizeObserver
- [performance](./performance.md). Forced-reflow rules for observer callbacks
