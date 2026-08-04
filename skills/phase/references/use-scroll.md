# `useScroll`

React hook wrapping `createScroll`. Lifecycle-aware scroll tracker with rAF-batched position reads. Auto-pauses when the element is off-screen, tears down on unmount.

Scroll position is delivered imperatively via `onScroll` (never state) and mirrored in `stateRef`; only the phase (tracking/paused) is reactive, since it flips rarely. This mirrors `usePointer`.

## Signature

```ts
import { useScroll } from 'phase/react';

const { ref, phase, phaseReason, phaseRef, phaseReasonRef, stateRef, measure } =
  useScroll<T>(options);
```

### Options

| Option                | Type                           | Default   | Description                                        |
| --------------------- | ------------------------------ | --------- | -------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`         | returned  | Bring your own ref, or attach the returned one     |
| `onScroll`            | `(state: ScrollState) => void` | required  | Called once per rAF frame with position + progress |
| `visibility`          | `'pause' \| 'ignore'`          | `'pause'` | Pause when off-screen or ignore visibility         |
| `enabled`             | `boolean`                      | `true`    | When `false`, tears down the tracker               |
| `intersectionOptions` | `IntersectionObserverInit`     | —         | Forwarded to the visibility observer               |

### Return

| Property         | Type                      | Description                                               |
| ---------------- | ------------------------- | --------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`    | Attach to the scroll container                            |
| `phase`          | `ScrollPhase`             | `'tracking' \| 'paused' \| 'stopped'`                     |
| `phaseReason`    | `ScrollReason`            | `'initial' \| 'started' \| 'sight' \| 'disposed'`         |
| `phaseRef`       | `RefObject<ScrollPhase>`  | Phase via ref. Always current, never triggers re-render   |
| `phaseReasonRef` | `RefObject<ScrollReason>` | Reason via ref. Always current, never triggers re-render  |
| `stateRef`       | `RefObject<ScrollState>`  | Latest `ScrollState` via ref. Never triggers re-render    |
| `measure`        | `() => void`              | Re-read geometry after a content change (stable identity) |

See [create-scroll](./create-scroll.md) for the `ScrollState` fields. For a synchronous phase reaction (before React commits), use the core `createScroll`, which exposes `onPhaseChange`.

## When to use

- Custom scrollbars, carousels, and scroll-position indicators that write to the DOM directly (thumb transform, `disabled`, `aria-valuenow`) without re-rendering per scroll.
- Replacing a `scroll` handler that reads `scrollWidth`/`clientWidth` (forced reflow) or calls `setState` on every event.

## When not to use

| Instead of this                                | Use                                      |
| ---------------------------------------------- | ---------------------------------------- |
| Fraction of an element visible in the viewport | `useScrollProgress` (intersection ratio) |
| CSS-declarative scroll-linked animation        | Native `ScrollTimeline`                  |
| Element dimensions only                        | `useSize`                                |
| Framework-agnostic code                        | `createScroll` (core)                    |

## Do

- Drive a carousel scrollbar with zero re-renders:
  ```tsx
  const { ref, measure } = useScroll<HTMLDivElement>({
    onScroll: (s) => {
      thumbRef.current!.style.transform = `translateX(${s.progressX * (1 - s.visibleX) * 100}%) scaleX(${s.visibleX})`;
      prevRef.current!.disabled = s.x <= 1;
      nextRef.current!.disabled = s.x >= s.maxX - 1;
      barRef.current!.setAttribute(
        'aria-valuenow',
        String(Math.round(s.progressX * 100)),
      );
    },
  });
  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
    </div>
  );
  ```
- Read `stateRef.current` inside a `useLoop` tick for the latest position without closure staleness.
- Call `measure()` after changing scrollable content (the pooled `ResizeObserver` already handles container resizes).

## Don't

- **Don't read `scrollWidth`/`clientWidth` inside `onScroll`.** Geometry is cached and recomputed on resize/`measure()`; the callback already carries `maxX`/`visibleX`.
- **Don't expect `onScroll` to fire off-screen.** With `visibility: 'pause'` (default) the scroll listener detaches when the element is not visible.
- **Don't store the `ScrollState` object.** It is mutated in place each frame — read the values you need immediately.

## Reduced motion

Not applicable. `useScroll` reports scroll position, not animation. Gate any motion you derive from it with the usual reduced-motion handling.

## See also

- [create-scroll](./create-scroll.md). Framework-agnostic core and the `ScrollState` fields
- [use-pointer](./use-pointer.md). The structural sibling: rAF-batched pointer position
- [use-scroll-progress](./use-scroll-progress.md). Intersection ratio (viewport reveal), not scroll offset
- [use-loop](./use-loop.md). Per-frame DOM animation (common pairing with scroll data)
