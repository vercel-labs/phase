# `useMutation`

React hook wrapping `createMutation`. Lifecycle-aware MutationObserver with rAF-coalesced callbacks. Auto-pauses when the element is off-screen, tears down on unmount.

## Signature

Records are always delivered imperatively via `onMutations`; phase is reactive state (transitions are infrequent). This mirrors `useLoop` / `useCanvas`.

```ts
import { useMutation } from 'phase/react';

const { ref, phase, phaseReason, phaseRef, phaseReasonRef } =
  useMutation<T>(options);
```

### Options

| Option                | Type                                  | Default   | Description                                                                                                                               |
| --------------------- | ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`                | returned  | Bring your own ref, or attach the returned one                                                                                            |
| `mutation`            | `MutationObserverInit`                | required  | Standard MutationObserver config. Read once at subscribe time; a static config can be inline. Runtime changes are not tracked (see Don't) |
| `onMutations`         | `(records: MutationRecord[]) => void` | required  | Called once per rAF frame with coalesced records                                                                                          |
| `visibility`          | `'pause' \| 'ignore'`                 | `'pause'` | Pause observation when off-screen, or ignore visibility                                                                                   |
| `enabled`             | `boolean`                             | `true`    | When `false`, tears down the observer entirely                                                                                            |
| `intersectionOptions` | `IntersectionObserverInit`            | --        | Forwarded to the visibility observer                                                                                                      |

### Return

| Property         | Type                        | Description                                              |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`      | Attach to the observed element                           |
| `phase`          | `MutationPhase`             | `'observing' \| 'paused' \| 'stopped'`                   |
| `phaseReason`    | `MutationReason`            | `'initial' \| 'started' \| 'sight' \| 'disposed'`        |
| `phaseRef`       | `RefObject<MutationPhase>`  | Phase via ref. Always current, never triggers re-render  |
| `phaseReasonRef` | `RefObject<MutationReason>` | Reason via ref. Always current, never triggers re-render |

Phase transitions (observing ⇄ paused) fire only on visibility changes, so reactive `phase` costs at most one re-render per transition. For a synchronous phase reaction (e.g. posting to a worker before React commits), use the core `createMutation`, which exposes `onPhaseChange`.

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
- To handle mutations below frame rate, buffer them into a ref and throttle the drain. Unlike `usePointer`/`useScroll` (which expose a sampleable `stateRef`), `onMutations` delivers discrete `MutationRecord[]`, so collect records and process the batch with `useThrottledCallback`. The drain fires only when mutations occur; nothing runs while the DOM is quiet:
  ```tsx
  const pending = useRef<MutationRecord[]>([]);
  const drain = useThrottledCallback(
    () => processBatch(pending.current.splice(0)),
    { interval: 250 },
  );
  const { ref } = useMutation({
    mutation: { childList: true },
    onMutations: (records) => {
      pending.current.push(...records);
      drain();
    },
  });
  ```
- Render from `phase` directly; transitions are rare, so re-rendering on them is cheap:
  ```tsx
  const { ref, phase } = useMutation({
    mutation: { childList: true },
    onMutations: handleRecords,
  });
  // phase === 'observing' | 'paused' | 'stopped'
  ```
- Read `phaseRef.current` inside `onMutations` for the latest phase without closure staleness.

## Don't

- **Don't read layout inside `onMutations`.** Reading `getBoundingClientRect`, `offsetWidth`, or `getComputedStyle` forces a synchronous reflow even inside the rAF batch. Use `useSize` for dimensions.
- **Don't observe `subtree` + `attributeFilter: ['style', 'class']`.** Fires on every descendant style/class change. A dev-mode warning fires for this pattern.
- **Don't expect a changed `mutation` config to re-apply.** The observer reads it once at subscribe time; `mutation` is intentionally kept out of the effect's dependency array, so an inline static config is fine and never thrashes the observer. But a config derived from props/state that changes at runtime will _not_ take effect. To re-observe with a new config, toggle `enabled` off then on (or remount).

## Reduced motion

Not applicable. `useMutation` observes DOM changes, not animation.

## See also

- [createMutation](./create-mutation.md). Framework-agnostic core
- [useThrottledCallback](./use-throttled-callback.md). The throttle behind the buffered-drain recipe
- [useSight](./use-sight.md). Visibility observation (different signal)
- [useSize](./use-size.md). Dimension tracking via ResizeObserver
- [performance](./performance.md). Forced-reflow rules for observer callbacks
