# `createMutation`

Lifecycle-aware MutationObserver that coalesces records into one rAF-batched callback. Never fires per-record synchronously. Auto-pauses when the observed element is off-screen via pooled IntersectionObserver.

Within one clock protocol, event-derived callbacks queued before frame dispatch begins are flushed before any frame-loop callback in that frame. A callback first queued during either stage runs next frame; additional work can coalesce into an eligible callback that has not run yet.

## Signature

```ts
import { createMutation } from 'phase';

const mutation = createMutation(options: MutationOptions): Mutation;
```

### Options

| Option                | Type                                  | Default   | Description                                      |
| --------------------- | ------------------------------------- | --------- | ------------------------------------------------ |
| `target`              | `Element`                             | required  | Element to observe                               |
| `mutation`            | `MutationObserverInit`                | required  | Standard MutationObserver configuration          |
| `onMutations`         | `(records: MutationRecord[]) => void` | required  | Called once per rAF frame with coalesced records |
| `onPhaseChange`       | `(phase, reason) => void`             | --        | Called on phase transitions                      |
| `visibility`          | `'pause' \| 'ignore'`                 | `'pause'` | Pause observation when off-screen, or ignore     |
| `intersectionOptions` | `IntersectionObserverInit`            | --        | Forwarded to the visibility observer             |
| `signal`              | `AbortSignal`                         | --        | Stops the observer when aborted                  |

### Return (Mutation)

| Property      | Type             | Description                                       |
| ------------- | ---------------- | ------------------------------------------------- |
| `phase`       | `MutationPhase`  | `'observing' \| 'paused' \| 'stopped'`            |
| `phaseReason` | `MutationReason` | `'initial' \| 'started' \| 'sight' \| 'disposed'` |
| `stop()`      | `() => void`     | Disconnect and clean up                           |

### Phases

| Phase       | Meaning                                    |
| ----------- | ------------------------------------------ |
| `observing` | MutationObserver is connected and batching |
| `paused`    | Disconnected (off-screen or initial)       |
| `stopped`   | Permanently disposed                       |

### Reasons

| Reason     | Meaning                          |
| ---------- | -------------------------------- |
| `initial`  | Not yet started                  |
| `started`  | Element is visible, observing    |
| `sight`    | Paused because element is hidden |
| `disposed` | `stop()` or signal aborted       |

## When to use

- Reacting to DOM structure changes (`childList`) while the element is visible.
- Observing attribute changes on a narrow target without reflow storms.
- Coalescing frequent mutations (e.g., framework churn) into one batched read per frame.
- Replacing raw `new MutationObserver` calls that lack visibility pausing and rAF batching.

## When not to use

| Instead of this                             | Use                                          |
| ------------------------------------------- | -------------------------------------------- |
| Tracking element size changes               | `useSize` (ResizeObserver, async, no reflow) |
| Observing scroll position                   | `createScrollProgress`                       |
| Checking `style` or `class` changes broadly | Narrower signals (`useMediaQuery`, CSS vars) |
| React component                             | `useMutation` (manages refs and teardown)    |

## Do

- Observe `childList` for structural changes with visibility gating:
  ```ts
  const mutation = createMutation({
    target: list,
    mutation: { childList: true },
    onMutations: (records) => updateCount(records.length),
  });
  ```
- Observe specific attributes on a single element (not subtree):
  ```ts
  const mutation = createMutation({
    target: el,
    mutation: { attributes: true, attributeFilter: ['data-state'] },
    onMutations: (records) => syncState(records),
  });
  ```
- Use `visibility: 'ignore'` when the observer must run regardless of viewport position (rare, for document-level coordination).

## Don't

- **Don't observe `subtree` + `attributeFilter: ['style']` or `['class']`.** This fires on every descendant style/class change (animations, hovers, framework churn). A dev-mode warning fires when this shape is detected. Narrow the scope or use a different signal.
- **Don't read layout inside `onMutations`.** The callback runs in a rAF batch, but reading `getBoundingClientRect`, `offsetWidth`, `getComputedStyle` inside it still forces a synchronous reflow. Read from `useSize` or cached values instead.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.
- **Don't use for visibility detection.** Use `createSight` (IntersectionObserver, pooled, async).

## Reduced motion

Not applicable. `createMutation` observes DOM changes, not animation. The visibility-pausing signal composes with the same IO pool used by animation primitives.

## See also

- [useMutation](./use-mutation.md). React hook wrapping createMutation
- [createSight](./create-sight.md). Visibility observation (IO-based)
- [performance](./performance.md). Forced-reflow rules that apply inside `onMutations`
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option
