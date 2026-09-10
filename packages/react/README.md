<p align="center">
  <img src="https://raw.githubusercontent.com/vercel-labs/phase/main/.github/assets/phase-header.png" alt="phase" />
</p>

# @usephase/react

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

React hooks and components built on the lifecycle-aware primitives in `@usephase/core`.

## Install

```bash
pnpm add @usephase/core @usephase/react
```

## Getting started

```tsx
import { useLoop } from '@usephase/react';

function Orbit({ radius }) {
  const { ref } = useLoop({
    onTick: (frame) => {
      const angle = frame.elapsed / 1000;
      ref.current.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
    },
  });

  return <div ref={ref} className="dot" />;
}
```

Read the [full documentation](https://github.com/vercel-labs/phase#readme), review the [changelog](https://github.com/vercel-labs/phase/blob/main/packages/react/CHANGELOG.md), or see the [MIT license](https://github.com/vercel-labs/phase/blob/main/packages/react/LICENSE).
