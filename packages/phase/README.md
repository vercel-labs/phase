<p align="center">
  <img src="https://raw.githubusercontent.com/vercel-labs/phase/main/.github/assets/phase-header.png" alt="phase" />
</p>

# ▲ phase

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

Phase is a lightweight, lifecycle-aware UI performance layer for the web. It includes tools and guidance to optimize render performance, build performant animations, and manage layout and off-screen resources.

## Install

```bash
pnpm add phase
```

## Getting started

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

- **Pauses when unseen.** Off-screen or in a background tab, work stops and CPU drops to zero.
- **Respects reduced motion by default.** Accessibility is built in, not an opt-in.
- **Never forces a reflow.** No `getBoundingClientRect`, no layout thrash, anywhere in the package.
- **Zero re-renders from the frame loop.** Per-frame work writes to refs and the DOM, never React state.
- **Frame-locked shared clock.** Every animation on the page reads one clock, so nothing drifts out of sync.
- **Renders only what matters.** Skip painting off-screen content, mount non-critical UI when idle.

Read the [full documentation](https://github.com/vercel-labs/phase#readme), install the [phase agent skill](https://github.com/vercel-labs/phase/tree/main/skills/phase), review the [changelog](https://github.com/vercel-labs/phase/blob/main/CHANGELOG.md), or see the [MIT license](https://github.com/vercel-labs/phase/blob/main/packages/phase/LICENSE).
