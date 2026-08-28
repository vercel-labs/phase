# `createPointer`

Lifecycle-aware pointer tracker that reads `getBoundingClientRect` once per rAF frame instead of per `pointermove` event. Auto-pauses when the element is off-screen.

Event-derived state from pointer, scroll, mutation, and throttle is flushed before any frame-loop callback in the same frame.

## Signature

```ts
import { createPointer } from 'phase';

const pointer = createPointer(options: PointerOptions): Pointer;
```

### Options

| Option                | Type                            | Default   | Description                                    |
| --------------------- | ------------------------------- | --------- | ---------------------------------------------- |
| `target`              | `Element`                       | required  | Element to track pointer events on             |
| `onPointer`           | `(state: PointerState) => void` | required  | Called once per rAF frame with latest position |
| `onPhaseChange`       | `(phase, reason) => void`       | --        | Called on phase transitions                    |
| `visibility`          | `'pause' \| 'ignore'`           | `'pause'` | Pause when off-screen or ignore visibility     |
| `intersectionOptions` | `IntersectionObserverInit`      | --        | Forwarded to the visibility observer           |
| `signal`              | `AbortSignal`                   | --        | Stops the tracker when aborted                 |

### PointerState

| Field    | Type      | Description                                            |
| -------- | --------- | ------------------------------------------------------ |
| `x`      | `number`  | X position relative to the element's top-left (CSS px) |
| `y`      | `number`  | Y position relative to the element's top-left (CSS px) |
| `active` | `boolean` | Whether a pointer is currently over the element        |

### Return (Pointer)

| Property      | Type            | Description                                                |
| ------------- | --------------- | ---------------------------------------------------------- |
| `phase`       | `PointerPhase`  | `'idle' \| 'tracking' \| 'stopped'`                        |
| `phaseReason` | `PointerReason` | `'initial' \| 'enter' \| 'leave' \| 'sight' \| 'disposed'` |
| `state`       | `PointerState`  | Current pointer position (synchronous read)                |
| `stop()`      | `() => void`    | Detach listeners and clean up                              |

## When to use

- Custom cursors, tooltips, or hover effects that need element-relative pointer coordinates.
- Canvas or WebGL interaction where pointer position drives rendering.
- Any `pointermove` handler that currently calls `getBoundingClientRect()` per event.

## When not to use

| Instead of this                    | Use                                      |
| ---------------------------------- | ---------------------------------------- |
| Hover state (boolean)              | CSS `:hover` (no JS needed)              |
| Click handling                     | Standard event listeners (not per-frame) |
| Drag-and-drop with gesture physics | External library (e.g., `@use-gesture`)  |
| React component                    | `usePointer` (manages refs and teardown) |

## Tracking the document or window

`createPointer` exists to batch a per-element `getBoundingClientRect` into element-relative coordinates. For document- or window-level tracking there is no element rect worth batching — the pointer's viewport position is `clientX` / `clientY`, which ride on the event with no layout read and no reflow.

- **Viewport coordinates anywhere on the page:** use a plain listener. `window.addEventListener('pointermove', (e) => …e.clientX…)` is reflow-free; phase adds nothing.
- **Page-relative (scroll-inclusive) coordinates, or rAF-coalesced callbacks:** pass `document.documentElement` (the `<html>` element — `document` and `window` are not `Element`s) with `visibility: 'ignore'`. Tracking the root yields page coordinates, because its `rect.top` is `-scrollY`, and you still get one batched rect read + one `onPointer` per frame:

  ```ts
  const pointer = createPointer({
    target: document.documentElement,
    visibility: 'ignore', // the root is never meaningfully off-screen
    onPointer: (state) => {
      // state.x / state.y are page-relative (include scroll)
    },
  });
  ```

  Use `visibility: 'ignore'` here: an `IntersectionObserver` on the root is degenerate (it effectively always intersects), so the default `'pause'` mode buys nothing.

## Do

- Use for rAF-batched pointer tracking:
  ```ts
  const pointer = createPointer({
    target: el,
    onPointer: (state) => {
      cursor.style.transform = `translate(${state.x}px, ${state.y}px)`;
    },
  });
  ```
- Read `pointer.state` synchronously for current position outside the callback.
- Multiple instances share the IO pool for visibility gating.

## Don't

- **Don't call `getBoundingClientRect()` in your own `pointermove` handler.** That is what this primitive replaces: it reads the rect once per frame, not per event.
- **Don't reach for it just to know if the pointer is over the element.** Enter/leave are discrete events with no layout read — use CSS `:hover` or `pointerenter`/`pointerleave` listeners. This primitive is for continuous, per-frame position.
- **Don't use for drag-and-drop.** Drag needs velocity, gesture recognition, and momentum. Use a gesture library.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal.

## Reduced motion

Not applicable. `createPointer` tracks pointer position, not animation. The visibility-pausing signal composes with the same IO pool used by animation primitives.

## See also

- [usePointer](./use-pointer.md). React hook wrapping createPointer
- [createScroll](./create-scroll.md). The same rAF-batched, visibility-aware shape for scroll offset
- [createSight](./create-sight.md). Visibility observation (IO-based)
- [performance](./performance.md). Forced-reflow rules (why per-event `getBoundingClientRect` is a problem)
- [abort-signals](./abort-signals.md). Tear down this tracker via the `signal` option
