# `useRenderState`

Tracks whether the browser is rendering an element or skipping it under `content-visibility` (e.g. a `Defer` subtree). Returns `'rendered'` until the browser reports otherwise. Wraps `createRenderState`.

## Signature

```tsx
import { useRef } from 'react';
import { useRenderState } from 'phase/react';

const ref = useRef<HTMLDivElement>(null);
const phase = useRenderState(ref); // 'rendered' | 'skipped'
```

### Arguments

| Argument | Type                   | Description                                   |
| -------- | ---------------------- | --------------------------------------------- |
| `ref`    | `RefObject<T \| null>` | Ref to the element under `content-visibility` |

## When to use

- Pause raw, non-phase work (hand-written rAF, `setInterval`, expensive effects) when a `Defer` subtree stops painting.
- Read a `Defer`'s render-skip state by passing the `ref` you gave `Defer`.
- Detect when `ResizeObserver` (`useSize`, `useContainerQuery`) stops and resumes delivering observations inside a `Defer` subtree. The CSS Containment spec silences RO callbacks while content is skipped; `useRenderState` reports that transition so you can respond to it.

## When not to use

| Instead of this                 | Use                              |
| ------------------------------- | -------------------------------- |
| Pausing a phase loop off-screen | Nothing (phase loops self-pause) |
| Viewport visibility as a phase  | `useSight`                       |
| Non-React usage                 | `createRenderState`              |

## Do

- **Pause raw work when a `Defer` subtree is skipped:**
  ```tsx
  const ref = useRef<HTMLDivElement>(null);
  const phase = useRenderState(ref);
  useEffect(() => {
    if (phase === 'skipped') clock.pause();
    else clock.resume();
  }, [phase]);
  return (
    <Defer ref={ref}>
      <RawCanvasThing />
    </Defer>
  );
  ```

## Don't

- **Don't use it to gate phase loops.** `useLoop`/`useCanvas`/`useLifecycle` already self-pause off-screen.
- **Don't change layout or unmount on `'skipped'`.** That reintroduces layout shift.

## Does this affect layout or CLS?

No. The hook only observes and reports. Pausing CPU work in response has no layout effect. The `content-visibility` no-layout-shift guarantee stays intact.

## Reduced motion

Not applicable. Render-state is a paint signal, not an animation.

## See also

- [rendering-recipes](./rendering-recipes.md). Gating raw loops inside a `Defer` and other compositions
- [create-render-state](./create-render-state.md). The core primitive behind this hook
- [defer](./defer.md). The component whose render-skip state this reads
- [use-sight](./use-sight.md). Viewport visibility as a phase
