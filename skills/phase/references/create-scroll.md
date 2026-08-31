# `createScroll`

Lifecycle-aware scroll tracker. Reads `scrollLeft`/`scrollTop` once per rAF frame and reads the reflow-heavy geometry (`scrollWidth`/`clientWidth`) only on a coalesced resize or an explicit `measure()`, never on the scroll path. Auto-pauses off-screen. The framework-agnostic core behind `useScroll`.

Within one clock protocol, event-derived callbacks queued before frame dispatch begins are flushed before any frame-loop callback in that frame. A callback first queued during either stage runs next frame; additional work can coalesce into an eligible callback that has not run yet.

## Signature

```ts
import { createScroll } from 'phase';

const scroll = createScroll(options: CreateScrollOptions): Scroll;
```

### Options

| Option                | Type                                                 | Default   | Description                                                  |
| --------------------- | ---------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `target`              | `Element \| Document`                                | required  | Scroll container, or `document` for the page                 |
| `onScroll`            | `(state: ScrollState) => void`                       | required  | Called once per rAF frame with position + progress           |
| `onPhaseChange`       | `(phase: ScrollPhase, reason: ScrollReason) => void` | —         | Called on phase transitions                                  |
| `visibility`          | `'pause' \| 'ignore'`                                | `'pause'` | Pause tracking when off-screen, or ignore                    |
| `intersectionOptions` | `IntersectionObserverInit`                           | —         | Forwarded to the visibility observer. Ignored for `document` |
| `signal`              | `AbortSignal`                                        | —         | Stops the tracker when aborted                               |

> The options type is `CreateScrollOptions`. `ScrollOptions` is a `lib.dom` global and must not be shadowed.

### ScrollState

| Field       | Type     | Description                                                                               |
| ----------- | -------- | ----------------------------------------------------------------------------------------- |
| `x`         | `number` | `scrollLeft`, clamped to `[0, maxX]`                                                      |
| `y`         | `number` | `scrollTop`, clamped to `[0, maxY]`                                                       |
| `maxX`      | `number` | Max horizontal scroll (`scrollWidth - clientWidth`, never negative)                       |
| `maxY`      | `number` | Max vertical scroll (`scrollHeight - clientHeight`, never negative)                       |
| `progressX` | `number` | `x / maxX` (0–1), `0` when not scrollable                                                 |
| `progressY` | `number` | `y / maxY` (0–1), `0` when not scrollable                                                 |
| `visibleX`  | `number` | `clientWidth / scrollWidth` (0–1), `1` when not scrollable; the horizontal thumb `scaleX` |
| `visibleY`  | `number` | `clientHeight / scrollHeight` (0–1), `1` when not scrollable; the vertical thumb `scaleY` |

### Return (Scroll)

| Property      | Type                    | Description                                           |
| ------------- | ----------------------- | ----------------------------------------------------- |
| `phase`       | `ScrollPhase`           | `'tracking' \| 'paused' \| 'stopped'`                 |
| `phaseReason` | `ScrollReason`          | `'initial' \| 'started' \| 'sight' \| 'disposed'`     |
| `state`       | `Readonly<ScrollState>` | Latest scroll state, synchronous read (do not mutate) |
| `measure()`   | `() => void`            | Re-read geometry after a content change               |
| `stop()`      | `() => void`            | Detach listeners and clean up                         |

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
    target: viewport,
    onScroll: (s) => {
      // thumb CSS needs `transform-origin: left` so scaleX anchors to the track start
      thumb.style.transform = `translateX(${s.progressX * (1 - s.visibleX) * 100}%) scaleX(${s.visibleX})`;
      prevBtn.disabled = s.x <= 1;
      nextBtn.disabled = s.x >= s.maxX - 1;
    },
  });
  ```
- Call `measure()` after mutating scrollable content (adding/removing children). The `ResizeObserver` catches container resizes automatically; content-driven `scrollWidth` changes need `measure()`.
- Expect resize-driven geometry to land on the next frame. Resize signals are coalesced into the same rAF flush as scroll, so a burst (or a page hearing one change from both the observer and the resize event) costs one layout read. `measure()` stays synchronous when you need the value immediately.

## Don't

- **Don't read `scrollWidth`/`clientWidth` in your own `scroll` handler.** That is the reflow this primitive removes: geometry is read on resize/`measure()` and cached; the scroll path reads only `scrollLeft`/`scrollTop`.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.
- **Don't use it for viewport reveal effects.** That is intersection ratio. Use `createScrollProgress`.

## Page scroll

Pass `document` to track the page scroller:

```ts
const scroll = createScroll({
  target: document,
  onScroll: (s) => {
    bar.style.transform = `scaleX(${s.progressY})`;
  },
});
```

Offsets and geometry come from `document.scrollingElement` (the `body` in quirks mode), while the `scroll` listener stays on the Document, where the page fires it. Listening on `documentElement` instead would never fire.

Because the page is always in view, `visibility: 'pause'` reacts to tab visibility alone and creates no `IntersectionObserver`; `intersectionOptions` is ignored. Page mode also re-measures on window resize, since a viewport height change moves `maxY` without resizing the scrolling element's content box.

## Limitations

- **LTR only.** Position clamps to `[0, maxX]`; RTL's negative or max-origin `scrollLeft` is not yet handled.
- **Content resize needs `measure()`.** The `ResizeObserver` catches container resizes; adding or removing scrollable children changes `scrollWidth` without firing it.

## Reduced motion

Not applicable. `createScroll` reports scroll position, not animation. Gate any motion you derive from it with the usual reduced-motion handling.

## See also

- [use-scroll](./use-scroll.md). React hook wrapping createScroll
- [create-pointer](./create-pointer.md). The structural sibling: rAF-batched `getBoundingClientRect`
- [create-scroll-progress](./create-scroll-progress.md). Intersection ratio (viewport reveal), not scroll offset
- [performance](./performance.md). Why per-event `scrollWidth`/`clientWidth` reads are a problem
- [abort-signals](./abort-signals.md). Tear down this tracker via the `signal` option
