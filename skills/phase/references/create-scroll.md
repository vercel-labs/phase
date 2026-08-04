# `createScroll`

Lifecycle-aware scroll tracker. Reads `scrollLeft`/`scrollTop` once per rAF frame and reads the reflow-heavy geometry (`scrollWidth`/`clientWidth`) only on resize or explicit `measure()`, never on the scroll path. Auto-pauses off-screen. The framework-agnostic core behind `useScroll`.

## Signature

```ts
import { createScroll } from 'phase';

const scroll = createScroll(options: CreateScrollOptions): Scroll;
```

### Options

| Option                | Type                                                 | Default   | Description                                        |
| --------------------- | ---------------------------------------------------- | --------- | -------------------------------------------------- |
| `element`             | `Element`                                            | required  | Scroll container to track                          |
| `onScroll`            | `(state: ScrollState) => void`                       | required  | Called once per rAF frame with position + progress |
| `onPhaseChange`       | `(phase: ScrollPhase, reason: ScrollReason) => void` | —         | Called on phase transitions                        |
| `visibility`          | `'pause' \| 'ignore'`                                | `'pause'` | Pause tracking when off-screen, or ignore          |
| `intersectionOptions` | `IntersectionObserverInit`                           | —         | Forwarded to the visibility observer               |
| `signal`              | `AbortSignal`                                        | —         | Stops the tracker when aborted                     |

> The options type is `CreateScrollOptions`, not `ScrollOptions` — the latter is a `lib.dom` global and must not be shadowed.

### ScrollState

| Field       | Type     | Description                                                         |
| ----------- | -------- | ------------------------------------------------------------------- |
| `x`         | `number` | `scrollLeft`, clamped to `[0, maxX]`                                |
| `y`         | `number` | `scrollTop`, clamped to `[0, maxY]`                                 |
| `maxX`      | `number` | Max horizontal scroll (`scrollWidth - clientWidth`, never negative) |
| `maxY`      | `number` | Max vertical scroll (`scrollHeight - clientHeight`, never negative) |
| `progressX` | `number` | `x / maxX` (0–1), `0` when not scrollable                           |
| `progressY` | `number` | `y / maxY` (0–1), `0` when not scrollable                           |
| `visibleX`  | `number` | `clientWidth / scrollWidth` (0–1) — the horizontal thumb `scaleX`   |
| `visibleY`  | `number` | `clientHeight / scrollHeight` (0–1) — the vertical thumb `scaleY`   |

### Return (Scroll)

| Property      | Type           | Description                                       |
| ------------- | -------------- | ------------------------------------------------- |
| `phase`       | `ScrollPhase`  | `'tracking' \| 'paused' \| 'stopped'`             |
| `phaseReason` | `ScrollReason` | `'initial' \| 'started' \| 'sight' \| 'disposed'` |
| `state`       | `ScrollState`  | Latest scroll state (synchronous read)            |
| `measure()`   | `() => void`   | Re-read geometry after a content change           |
| `stop()`      | `() => void`   | Detach listeners and clean up                     |

## When to use

- Custom scrollbars/carousels: drive a thumb transform, `disabled` buttons, and `aria-valuenow` from scroll position without re-renders.
- Any `scroll` handler that currently reads `scrollWidth`/`clientWidth` (forced reflow) or calls `setState` per event.
- Imperative scroll-driven DOM updates that are **not** expressible as a CSS scroll timeline.

## When not to use

| Instead of this                                | Use                                         |
| ---------------------------------------------- | ------------------------------------------- |
| Fraction of an element visible in the viewport | `createScrollProgress` (intersection ratio) |
| CSS-declarative scroll-linked animation        | Native `ScrollTimeline`                     |
| Element dimensions only                        | `useSize` / `createSight`                   |
| React component                                | `useScroll` (manages refs and teardown)     |

## Do

- Drive a custom scrollbar from cached geometry:
  ```ts
  const scroll = createScroll({
    element: viewport,
    onScroll: (s) => {
      thumb.style.transform = `translateX(${s.progressX * (1 - s.visibleX) * 100}%) scaleX(${s.visibleX})`;
      prevBtn.disabled = s.x <= 1;
      nextBtn.disabled = s.x >= s.maxX - 1;
    },
  });
  ```
- Call `measure()` after mutating scrollable content (adding/removing children). The `ResizeObserver` catches container resizes automatically; content-driven `scrollWidth` changes need `measure()`.

## Don't

- **Don't read `scrollWidth`/`clientWidth` in your own `scroll` handler.** That is the reflow this primitive removes: geometry is read on resize/`measure()` and cached; the scroll path reads only `scrollLeft`/`scrollTop`.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.
- **Don't use it for viewport reveal effects.** That is intersection ratio — use `createScrollProgress`.

## Reduced motion

Not applicable. `createScroll` reports scroll position, not animation. Gate any motion you derive from it with the usual reduced-motion handling. The visibility-pausing signal composes with the same IO pool used by animation primitives.

## See also

- [use-scroll](./use-scroll.md). React hook wrapping createScroll
- [create-pointer](./create-pointer.md). The structural sibling: rAF-batched `getBoundingClientRect`
- [create-scroll-progress](./create-scroll-progress.md). Intersection ratio (viewport reveal), not scroll offset
- [performance](./performance.md). Why per-event `scrollWidth`/`clientWidth` reads are a problem
- [abort-signals](./abort-signals.md). Tear down this tracker via the `signal` option
