# `usePointer`

React hook wrapping `createPointer`. Lifecycle-aware pointer tracker with rAF-batched `getBoundingClientRect`. Auto-pauses when the element is off-screen, tears down on unmount.

## Signature

Position is always delivered imperatively via `onPointer` (never state) and mirrored in `stateRef`; phase is reactive state (transitions are infrequent). This mirrors `useLoop` / `useCanvas`.

```ts
import { usePointer } from 'phase/react';

const { ref, phase, phaseReason, phaseRef, phaseReasonRef, stateRef } =
  usePointer<T>(options);
```

### Options

| Option                | Type                            | Default   | Description                                    |
| --------------------- | ------------------------------- | --------- | ---------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`          | returned  | Bring your own ref, or attach the returned one |
| `onPointer`           | `(state: PointerState) => void` | required  | Called once per rAF frame with latest position |
| `visibility`          | `'pause' \| 'ignore'`           | `'pause'` | Pause when off-screen or ignore visibility     |
| `enabled`             | `boolean`                       | `true`    | When `false`, tears down the tracker           |
| `intersectionOptions` | `IntersectionObserverInit`      | --        | Forwarded to the visibility observer           |

### Return

| Property         | Type                       | Description                                                 |
| ---------------- | -------------------------- | ----------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`     | Attach to the tracked element                               |
| `phase`          | `PointerPhase`             | `'idle' \| 'tracking' \| 'stopped'`                         |
| `phaseReason`    | `PointerReason`            | `'initial' \| 'enter' \| 'leave' \| 'sight' \| 'disposed'`  |
| `phaseRef`       | `RefObject<PointerPhase>`  | Phase via ref. Always current, never triggers re-render     |
| `phaseReasonRef` | `RefObject<PointerReason>` | Reason via ref. Always current, never triggers re-render    |
| `stateRef`       | `RefObject<PointerState>`  | Latest `{ x, y, active }` via ref. Never triggers re-render |

Phase transitions (tracking ⇄ idle) fire only on pointer enter/leave, so reactive `phase` costs at most one re-render per transition. For a synchronous phase reaction, use the core `createPointer`, which exposes `onPhaseChange`.

## When to use

- Custom cursor effects that follow the pointer relative to an element.
- Canvas interaction where pointer position drives per-frame rendering.
- Tooltip positioning that reads element bounds without per-event reflow.

## When not to use

| Instead of this                  | Use                                               |
| -------------------------------- | ------------------------------------------------- |
| Hover state (boolean)            | CSS `:hover` or `onPointerEnter`/`onPointerLeave` |
| Click handling                   | Standard `onClick` handler                        |
| Drag-and-drop or gesture physics | External library (`@use-gesture`)                 |
| Framework-agnostic code          | `createPointer` (core)                            |

## Do

- Cleanup is automatic. The effect teardown detaches listeners on unmount.
- Use for custom cursor tracking:
  ```tsx
  const cursorRef = useRef<HTMLDivElement>(null);
  const { ref } = usePointer({
    onPointer: (state) => {
      if (!cursorRef.current) return;
      cursorRef.current.style.transform = `translate(${state.x}px, ${state.y}px)`;
      cursorRef.current.style.opacity = state.active ? '1' : '0';
    },
  });
  return (
    <div ref={ref}>
      <div ref={cursorRef} className="custom-cursor" />
    </div>
  );
  ```
- Render from `phase` when you need to react to enter/leave in the tree (e.g. show a tooltip). Transitions are rare, so re-rendering on them is cheap:
  ```tsx
  const { ref, phase } = usePointer({ onPointer: handlePointer });
  return <div ref={ref}>{phase === 'tracking' ? <Tooltip /> : null}</div>;
  ```
- Read `stateRef.current` inside a `useLoop` tick for the latest position without wiring your own ref or risking closure staleness:
  ```tsx
  const { ref, stateRef } = usePointer({ onPointer: () => {} });
  useLoop({
    ref,
    onTick: () => {
      const { x, y, active } = stateRef.current;
      if (active) draw(x, y);
    },
  });
  ```

## Don't

- **Don't read layout inside `onPointer`.** The callback already provides element-relative coordinates computed from one `getBoundingClientRect` call per frame. Calling layout-triggering APIs again defeats the purpose.
- **Don't use for drag gestures.** Pointer tracking stops at `pointerleave`. Drag needs pointer capture, velocity, and momentum. Use a gesture library.

## Reduced motion

Not applicable. `usePointer` tracks pointer position, not animation.

## See also

- [createPointer](./create-pointer.md). Framework-agnostic core
- [useLoop](./use-loop.md). Per-frame DOM animation (common pairing with pointer data)
- [useCanvas](./use-canvas.md). Canvas animation with pointer interaction
- [useSize](./use-size.md). Element dimensions via ResizeObserver (no reflow)
