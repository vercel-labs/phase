# phase

Lifecycle-aware animation infrastructure for the web. Zero-allocation frame loops that pause off-screen, resume in view, and respect reduced motion by default.

## Install

```bash
npm install phase
```

## Entry Points

| Import        | Contents                                                |
| ------------- | ------------------------------------------------------- |
| `phase`       | Core primitives — easing, tickers, sight, loops, errors |
| `phase/react` | React hooks and components                              |

## Core (`phase`)

### Easing & Math

```ts
import { lerp, clamp01, easeOutCubic, remap } from 'phase';
```

- `easeOutCubic`, `easeOutQuart`, `easeOutBack`, `easeInOutCubic`, `linear`
- `clamp(value, min, max)`, `clamp01(value)`
- `lerp(a, b, t)`, `inverseLerp(a, b, value)`, `remap(value, options)`

### Ticker

A shared `requestAnimationFrame` clock with zero per-frame allocations.

```ts
import { createTicker } from 'phase';

const ticker = createTicker({ fps: 60 });
ticker.on('tick', (frame) => {
  // frame.delta, frame.elapsed, frame.phase
});
ticker.start();
```

### Sight

Visibility tracking via pooled `IntersectionObserver` + `document.visibilitychange`.

```ts
import { createSight } from 'phase';

const sight = createSight({ element: el, threshold: 0.5 });
sight.on('change', (phase) => {
  // 'entering' | 'visible' | 'leaving' | 'hidden'
});
```

### Loop

Combines ticker + sight + reduced-motion awareness into one lifecycle-aware animation loop.

```ts
import { createLoop } from 'phase';

const loop = createLoop({
  element: el,
  onTick: (frame) => {
    /* animate */
  },
});
loop.start();
```

### Errors

```ts
import { PhaseError, isPhaseError } from 'phase';
```

Structured errors with codes: `server_context`, `no_element`, `sight_disposed`, `invalid_duration`, `ticker_stopped`, `presence_no_children`, `missing_context`.

## React (`phase/react`)

All hooks require React 18+.

### Animation Hooks

```tsx
import { useLoop, useTween, useCanvas } from 'phase/react';

// Frame loop bound to a ref
const { ref } = useLoop({
  onTick: (frame) => {
    /* ... */
  },
});

// Tweened value
const opacity = useTween({ to: 1, duration: 300 });

// DPR-aware canvas
const { ref, ctx } = useCanvas({
  onDraw: (ctx, frame) => {
    /* ... */
  },
});
```

### Visibility & Layout Hooks

```tsx
import {
  useSight,
  useSize,
  useContainerQuery,
  useMediaQuery,
} from 'phase/react';

const { ref, phase } = useSight();
const size = useSize(ref); // { width, height } | null
const isWide = useContainerQuery(ref, 768);
const isDark = useMediaQuery('(prefers-color-scheme: dark)');
```

### Presence & Transitions

```tsx
import { usePresence, Presence, Swap } from 'phase/react';

// Hook API
const { ref, phase, isMounted } = usePresence({ visible, duration: 200 });

// Component API — auto-stamps data-phase attribute
<Presence visible={show} duration={200}>
  <div>I animate in and out</div>
</Presence>

// Coordinated state transitions
<Swap value={currentState}>
  <Swap.State value="loading"><Spinner /></Swap.State>
  <Swap.State value="ready"><Content /></Swap.State>
</Swap>
```

### Utility Hooks

```tsx
import { useSyncedRef, useStableCallback } from 'phase/react';

const latestRef = useSyncedRef(value); // always-fresh ref
const stableFn = useStableCallback(fn); // stable identity
```

## Design Principles

- **Zero per-frame allocations** — `FrameState` object is reused across ticks
- **Shared clock** — all tickers share one `requestAnimationFrame` loop
- **Observer pooling** — IntersectionObserver, ResizeObserver, and MediaQueryList instances are shared
- **Lifecycle-aware** — automatically pauses off-screen, respects `prefers-reduced-motion`
- **Quality degradation** — caps FPS when frame budget is exceeded or tab is unfocused

## License

MIT
