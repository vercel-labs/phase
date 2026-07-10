# `createPointer`

Lifecycle-aware pointer tracker that reads `getBoundingClientRect` once per rAF frame instead of per `pointermove` event. Auto-pauses when the element is off-screen.

## Signature

```ts
import { createPointer } from 'phase';

const pointer = createPointer(options: PointerOptions): Pointer;
```

### Options

| Option                | Type                            | Default  | Description                                    |
| --------------------- | ------------------------------- | -------- | ---------------------------------------------- |
| `element`             | `Element`                       | required | Element to track pointer events on             |
| `onPointer`           | `(state: PointerState) => void` | required | Called once per rAF frame with latest position |
| `visibilityAware`     | `boolean`                       | `true`   | Pause tracking while off-screen                |
| `intersectionOptions` | `IntersectionObserverInit`      | --       | Forwarded to the visibility observer           |
| `signal`              | `AbortSignal`                   | --       | Stops the tracker when aborted                 |

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

## Do

- Use for rAF-batched pointer tracking:
  ```ts
  const pointer = createPointer({
    element: el,
    onPointer: (state) => {
      cursor.style.transform = `translate(${state.x}px, ${state.y}px)`;
    },
  });
  ```
- Read `pointer.state` synchronously for current position outside the callback.
- Multiple instances share the IO pool for visibility gating.

## Don't

- **Don't call `getBoundingClientRect()` in your own `pointermove` handler.** That is what this primitive replaces: it reads the rect once per frame, not per event.
- **Don't use for drag-and-drop.** Drag needs velocity, gesture recognition, and momentum. Use a gesture library.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal.

## Reduced motion

Not applicable. `createPointer` tracks pointer position, not animation. The visibility-pausing signal composes with the same IO pool used by animation primitives.

## See also

- [usePointer](./use-pointer.md). React hook wrapping createPointer
- [createSight](./create-sight.md). Visibility observation (IO-based)
- [performance](./performance.md). Forced-reflow rules (why per-event `getBoundingClientRect` is a problem)
- [abort-signals](./abort-signals.md). Tear down this tracker via the `signal` option
