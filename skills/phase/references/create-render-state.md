# `createRenderState`

Reports whether the browser is rendering an element or skipping it under `content-visibility`. Listens to `contentvisibilityautostatechange`, the browser's ground-truth paint decision. Framework-agnostic core primitive; `useRenderState` wraps it for React.

## Signature

```ts
import { createRenderState } from 'phase';

const render = createRenderState({
  element: el,
  onPhaseChange: (phase) => {
    // phase: 'rendered' | 'skipped'
  },
});
// cleanup:
render.stop();
```

### Options

| Option          | Type                           | Default  | Description                                   |
| --------------- | ------------------------------ | -------- | --------------------------------------------- |
| `element`       | `Element`                      | required | Element under `content-visibility`            |
| `onPhaseChange` | `(phase: RenderPhase) => void` | —        | Called on each render-state transition        |
| `signal`        | `AbortSignal`                  | —        | Stops the observer when the signal is aborted |

### Phases

| Phase        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `'rendered'` | Browser is rendering the element (initial + default) |
| `'skipped'`  | Browser is skipping rendering (off-screen)           |

## When to use

- Pause raw, non-phase work (a hand-written rAF loop, `setInterval`, expensive effects) when a `Defer` subtree stops painting.
- React to the browser's actual paint decision rather than an IntersectionObserver approximation.

## When not to use

| Instead of this                 | Use                              |
| ------------------------------- | -------------------------------- |
| Pausing a phase loop off-screen | Nothing — phase loops self-pause |
| Boolean viewport visibility     | `createSight`                    |
| React component                 | `useRenderState`                 |

## Do

- **Pause raw work when skipped:**
  ```ts
  const render = createRenderState({
    element: el,
    onPhaseChange: (phase) =>
      phase === 'skipped' ? clock.pause() : clock.resume(),
  });
  ```

## Don't

- **Don't reach for it to "keep phase animations alive".** `useLoop`/`useCanvas`/`useLifecycle` already self-pause off-screen via `createSight`.
- **Don't mutate layout or unmount on `skipped`.** That reintroduces layout shift.

## Does this affect layout or CLS?

No. It only listens and reports. Reacting by pausing CPU work has zero layout effect. The no-layout-shift guarantee of `content-visibility` stays intact.

## Reduced motion

Not applicable. Render-state is a paint signal, not an animation.

## See also

- [use-render-state](./use-render-state.md). The React hook wrapper
- [defer](./defer.md). The `content-visibility` component this observes
- [create-sight](./create-sight.md). Viewport visibility, the IO-based sibling signal
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option
