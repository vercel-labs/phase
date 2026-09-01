<p align="center">
  <img src="https://raw.githubusercontent.com/vercel-labs/phase/main/.github/assets/phase-header.png" alt="phase" />
</p>

# ▲ phase

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

The `phase` package is a lifecycle-aware browser runtime layer for animation, rendering, and loading work. It combines visibility, reduced motion, idle scheduling, and frame timing so applications can stop or defer work that does not need to run yet.

The broader [phase toolkit](https://github.com/vercel-labs/phase) also includes an agent skill and deterministic source scanner. The skill audits applications, and the scanner finds source candidates for review; neither requires this package.

## Install

```bash
pnpm add phase
```

## Getting started

### Defer off-screen rendering

```tsx
import { Defer } from 'phase/react';

function Article() {
  return (
    <Defer as="section" estimatedHeight="600px">
      <RelatedStories />
    </Defer>
  );
}
```

`Defer` keeps the content in the DOM and server-rendered HTML while the browser skips its off-screen style, layout, and paint work.

### Run live animation without hidden work

```tsx
import { useLoop } from 'phase/react';

function Orbit({ radius }) {
  const speed = 1; // radians per second
  const { ref } = useLoop({
    onTick: (frame) => {
      const angle = (frame.elapsed / 1000) * speed;
      ref.current.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
    },
  });

  return <div ref={ref} className="dot" />;
}
```

## Why phase

- **Animates only when needed.** Prefer browser-owned playback when it fits; use phase when live JavaScript needs lifecycle control.
- **Renders only when needed.** Skip off-screen style, layout, and paint, schedule non-critical mounts after an idle callback or next-task fallback, or wait until content nears the viewport.
- **Loads only when needed.** Schedule non-critical imports with `requestIdleCallback` when available; browsers without it use a next-task fallback.
- **Pauses when unseen.** Off-screen or in a background tab, work stops and CPU drops to zero.
- **Respects reduced motion by default.** Accessibility is built in, not an opt-in.
- **Batches layout reads.** Element-relative pointer tracking reads one rect per dirty frame; scroll geometry is read on attachment or explicit measurement and coalesced after resize signals; other dimensions and visibility come from observers.
- **Zero re-renders from the frame loop.** Per-frame work writes to refs and the DOM, never React state.
- **Frame-locked shared clock.** Tickers using the same clock protocol read one timestamp, so they do not drift out of sync.
- **Input before frame loops.** Within one clock protocol, pointer, scroll, mutation, and throttle work queued before a frame flushes before its animation callbacks.

Read the [full documentation](https://github.com/vercel-labs/phase#readme), install the [phase agent skill](https://github.com/vercel-labs/phase/tree/main/skills/phase), review the [changelog](https://github.com/vercel-labs/phase/blob/main/CHANGELOG.md), or see the [MIT license](https://github.com/vercel-labs/phase/blob/main/packages/phase/LICENSE).
