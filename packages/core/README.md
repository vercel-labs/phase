<p align="center">
  <img src="https://raw.githubusercontent.com/vercel-labs/phase/main/.github/assets/phase-header.png" alt="phase" />
</p>

# @usephase/core

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

Framework-agnostic, lifecycle-aware primitives for animation and rendering performance.

## Install

```bash
pnpm add @usephase/core
```

## Getting started

```ts
import { createLoop } from '@usephase/core';

const loop = createLoop({
  target: document.querySelector('.dot'),
  onTick: (frame) => {
    console.log(frame.elapsed);
  },
});

loop.start();
```

## Why @usephase/core

- **Pauses when unseen.** Off-screen or in a background tab, work stops and CPU drops to zero.
- **Respects reduced motion by default.** Accessibility is built in, not an opt-in.
- **Batches layout reads.** Element-relative pointer tracking reads one rect per dirty frame; scroll geometry is read on attachment or explicit measurement and coalesced after resize signals; other dimensions and visibility come from observers.
- **Frame-locked shared clock.** Tickers using the same clock protocol read one timestamp, so they do not drift out of sync.
- **Input before frame loops.** Within one clock protocol, pointer, scroll, mutation, and throttle work queued before a frame flushes before its animation callbacks.
- **Tracks skipped rendering and schedules idle work.** Receive updates when `content-visibility` skips an element, and run callbacks during browser idle periods.

Easing and math functions are available only from `@usephase/core/ease`.

`@usephase/core/internal` is reserved for `@usephase/*` binding packages. Applications must not import it. It has no deprecation cycle or compatibility guarantee.

React applications can add [`@usephase/react`](https://www.npmjs.com/package/@usephase/react). Read the [full documentation](https://github.com/vercel-labs/phase#readme), install the [phase agent skill](https://github.com/vercel-labs/phase/tree/main/skills/phase), review the [changelog](https://github.com/vercel-labs/phase/blob/main/packages/core/CHANGELOG.md), or see the [MIT license](https://github.com/vercel-labs/phase/blob/main/packages/core/LICENSE).
