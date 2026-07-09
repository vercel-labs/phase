---
name: phase
description: "Use when building, reviewing, or optimizing web animations OR rendering performance (frame loops, scroll/viewport reveals, mount/unmount transitions, canvas/WebGL lifecycles, reduced-motion handling, lazy rendering, deferring off-screen or non-critical work) with the phase library. Also use when auditing existing animation or rendering code to decide between CSS-only, minimal JS, phase, or a heavier library like motion. Trigger on janky animations, per-frame allocations, forced reflows, re-renders from animation loops, animations that don't pause off-screen, missing reduced-motion support, content-visibility, lazy-mounting on viewport or idle, requestIdleCallback, deferring rendering of long pages, or questions like 'should I use CSS or JS for this animation' or 'how do I render this off-screen content faster'. Always use this skill when you mention phase or any phase export."
license: MIT
metadata:
  author: vercel
  version: '0.0.4'
  abstract: 'Lifecycle-aware animation and rendering skill. Implement phase primitives correctly, follow performant-animation and render-gating best practices, and audit existing code to recommend CSS-only, minimal JS, phase, or an external library.'
---

## Prerequisite: ensure phase is installed

Before recommending phase imports, check the **consumer project's** `package.json` for `"phase"` in `dependencies`. If it is missing, install `phase` as a production dependency in that project. Do not install it in the phase repo itself (where phase is the package being developed). Skip this check when the task is auditing or advising without code changes.

# phase

This skill teaches you to implement phase primitives correctly, preserve performance guarantees, and audit animation code. Phase is the lifecycle-aware performance layer for the web: it composes visibility, reduced motion, and frame budget signals so animations pause when unseen, respect user preferences, and never force a reflow.

## The animation ladder

Always prefer the cheapest tier that satisfies the requirement. Never recommend phase where CSS suffices; never recommend an external library where phase suffices.

| Tier                 | When                                                                           | Tools                                                                                          |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **CSS-only**         | Enter/exit, hover, state toggles, opacity and transform toggles                | `transition`, `@starting-style`, `animation`, View Transitions API                             |
| **Minimal JS**       | One value into React render, no per-frame DOM writes                           | `useTween` (or CSS if render cost is trivial)                                                  |
| **phase**            | Per-frame JS, visibility pausing, canvas, lifecycle-aware loops, render gating | `useLoop`, `useCanvas`, `useLifecycle`, `Presence`, `Swap`, `WhenVisible`, `WhenIdle`, `Defer` |
| **External library** | Spring physics, gesture systems, declarative keyframe orchestration            | `motion`, GSAP, etc.                                                                           |

For the full decision tree, read [references/decision-guide.md](references/decision-guide.md). This ladder ranks _animation_ cost; rendering work runs on a parallel track.

## When to render, not only when to animate

phase is the _when_ layer (when to animate, render, and pause) from one set of signals. Three helpers skip increasing amounts of work for off-screen content:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Reach for it when                                  |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

`Defer` is the cheapest and safest (keeps content, skips paint) and never causes a hard layout shift; its children stay in the DOM at true size. `When*` save the most (no DOM until triggered) but **will shift layout / cause CLS unless the `fallback` reserves the exact final content height**, so always size it (see [references/rendering-recipes.md](references/rendering-recipes.md)).

Two idle hooks defer work off the critical path: `useIdle` gates rendering with a boolean once the browser is idle, and `useWhenIdle` runs a side effect (prefetch, `import()`) once idle. `useRenderState(ref)` reads a `Defer` subtree's render-skip state to pause **raw, non-phase** work (a hand-written rAF loop, `setInterval`); phase's own loops already self-pause off-screen.

## Choosing a primitive

The ladder picks a _tier_; this table picks the _primitive_ once phase is the right tier.

| Need                                                | Use                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Know if it's on screen?                             | `useSight`                                                                                  |
| Want phase to run your frame loop?                  | `useLoop` (DOM) / `useCanvas` (canvas)                                                      |
| You own the loop (WebGL, three.js, Web Worker)?     | `useLifecycle` (active/paused signal)                                                       |
| Animating one value into render?                    | `useTween`                                                                                  |
| Mount/unmount transitions?                          | `Presence` / `Swap` / `WhenVisible`                                                         |
| Skip painting off-screen content (keep in DOM)?     | `Defer`                                                                                     |
| Mount non-critical UI when idle?                    | `WhenIdle` / `useIdle`                                                                      |
| Run a side effect (prefetch, `import()`) when idle? | `useWhenIdle`                                                                               |
| Pause raw work inside a `Defer` subtree?            | `useRenderState`                                                                            |
| Reactive scroll/size/media values?                  | `useScrollProgress` / `useSize` / `useContainerQuery` / `useMediaQuery`                     |
| Scroll/size/visibility without re-renders?          | Same hooks with a callback (`onProgress` / `onResize` / `onVisibilityChange`), read via ref |
| Reactive reduced-motion check for non-phase code?   | `usePrefersReducedMotion`                                                                   |
| Need reactive `devicePixelRatio` for buffer sizing? | `useDevicePixelRatio`                                                                       |

## Non-negotiable invariants

Tests enforce these guarantees for animation hot paths. Violating them in consumer code is always a bug. (Rendering helpers carry one rule of their own: reserve fallback height so `WhenVisible` / `WhenIdle` don't shift layout, see [references/rendering-recipes.md](references/rendering-recipes.md).)

1. **Zero per-frame allocations.** No objects, arrays, closures, template literals, or spreads in `onTick`/`draw`.
2. **Never `setState` inside `onTick`.** Write to refs or the DOM directly. Only phase changes trigger re-renders.
3. **No forced reflows.** Never call `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` in animation paths. Use `useSize` / ResizeObserver.
4. **Strong pause.** `cancelAnimationFrame()` stops scheduling entirely. Zero callbacks, zero CPU when paused.
5. **Reduced motion by default.** All primitives respect `prefers-reduced-motion: reduce` automatically. Bypassing requires explicit `reducedMotion: 'ignore'`.
6. **Frame-locked shared clock.** One `performance.now()` per rAF frame. Multiple animations stay in sync.

For the full performance ruleset, read [references/performance.md](references/performance.md).

## Audit

When you review, optimize, or audit animation code, follow [references/audit.md](references/audit.md). It provides a repeatable procedure backed by a deterministic scanner (`scripts/scan.mjs`) that surfaces anti-pattern candidates before judgment.

## API reference index

Each export has its own reference file. Read the relevant file when implementing or advising on that export.

### Core (`phase`)

| Export                        | Use when                                             | Reference                                                               |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `createLoop`                  | Building a lifecycle-aware rAF animation loop        | [create-loop.md](references/create-loop.md)                             |
| `createTicker`                | Need a raw frame clock without visibility management | [create-ticker.md](references/create-ticker.md)                         |
| `createSight`                 | Observing element visibility (viewport + document)   | [create-sight.md](references/create-sight.md)                           |
| `createLifecycle`             | Providing active/paused signal to your own renderer  | [create-lifecycle.md](references/create-lifecycle.md)                   |
| `createScrollProgress`        | Tracking intersection ratio (0–1) for reveals        | [create-scroll-progress.md](references/create-scroll-progress.md)       |
| `createRenderState`           | Observing `content-visibility` render-skip state     | [create-render-state.md](references/create-render-state.md)             |
| `createDevicePixelRatio`      | Tracking DPR changes in framework-free code          | [create-device-pixel-ratio.md](references/create-device-pixel-ratio.md) |
| `whenIdle`                    | Running a one-off callback when the browser is idle  | [when-idle.md](references/when-idle.md)                                 |
| `prefersReducedMotion`        | Gating expensive setup or conditional imports        | [prefers-reduced-motion.md](references/prefers-reduced-motion.md)       |
| `PhaseError` / `isPhaseError` | Handling or classifying phase errors                 | [errors.md](references/errors.md)                                       |

### React (`phase/react`)

| Export                    | Use when                                                 | Reference                                                                 |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `useLoop`                 | Animating DOM elements in a per-frame loop               | [use-loop.md](references/use-loop.md)                                     |
| `useCanvas`               | Canvas/WebGL animation with DPR + resize handling        | [use-canvas.md](references/use-canvas.md)                                 |
| `useLifecycle`            | Gating a renderer you own (three.js, Pixi, WebGL)        | [use-lifecycle.md](references/use-lifecycle.md)                           |
| `useSight`                | Tracking visibility as a reactive phase                  | [use-sight.md](references/use-sight.md)                                   |
| `useTween`                | Animating a single number into React render output       | [use-tween.md](references/use-tween.md)                                   |
| `usePresence`             | Custom mount/unmount transitions (full control)          | [use-presence.md](references/use-presence.md)                             |
| `useScrollProgress`       | Driving opacity/reveals from intersection ratio          | [use-scroll-progress.md](references/use-scroll-progress.md)               |
| `useRenderState`          | Pausing raw work when a `Defer` subtree is skipped       | [use-render-state.md](references/use-render-state.md)                     |
| `useIdle`                 | Boolean that flips true once the browser is idle         | [use-idle.md](references/use-idle.md)                                     |
| `useWhenIdle`             | Run a side effect (prefetch, `import()`) once idle       | [use-when-idle.md](references/use-when-idle.md)                           |
| `useSize`                 | Reading element dimensions without reflows               | [use-size.md](references/use-size.md)                                     |
| `useContainerQuery`       | Breakpoint matching against element width/height         | [use-container-query.md](references/use-container-query.md)               |
| `useMediaQuery`           | Reactive CSS media query subscription                    | [use-media-query.md](references/use-media-query.md)                       |
| `usePrefersReducedMotion` | Reactive reduced-motion boolean for non-phase animations | [use-prefers-reduced-motion.md](references/use-prefers-reduced-motion.md) |
| `useDevicePixelRatio`     | Reactive DPR for buffer sizing outside `useCanvas`       | [use-device-pixel-ratio.md](references/use-device-pixel-ratio.md)         |
| `useSyncedRef`            | Keeping a ref always in sync with latest value           | [use-synced-ref.md](references/use-synced-ref.md)                         |
| `useStableCallback`       | Stable-identity function for memo'd children             | [use-stable-callback.md](references/use-stable-callback.md)               |
| `Presence`                | Show/hide with enter/exit transitions                    | [presence.md](references/presence.md)                                     |
| `WhenVisible`             | Viewport-gated lazy mount (one-shot)                     | [when-visible.md](references/when-visible.md)                             |
| `WhenIdle`                | Idle-gated lazy mount for non-critical UI                | [when-idle.md](references/when-idle.md)                                   |
| `Defer`                   | Skip painting off-screen content (keep in DOM)           | [defer.md](references/defer.md)                                           |
| `Swap`                    | Coordinated exit-then-enter between N states             | [swap.md](references/swap.md)                                             |

### Ease (`phase/ease`)

| Export            | Use when                                               | Reference                     |
| ----------------- | ------------------------------------------------------ | ----------------------------- |
| All easing + math | Computing animated values (lerp, clamp, easing curves) | [ease.md](references/ease.md) |

### Search across references

For concepts that span multiple references, grep is faster than guessing which file to open.

```bash
grep -ri "reduced motion" skills/phase/references/   # every export's motion behavior
grep -ri "data-phase" skills/phase/references/        # which components stamp phase attributes
grep -ri "cleanup\|unmount\|stop()" skills/phase/references/  # teardown behavior across hooks
grep -ri "pooled\|observer" skills/phase/references/  # which exports use shared observer pools
grep -ri "will-change" skills/phase/references/       # GPU layer guidance across contexts
grep -ri "FrameState\|frame\.delta\|frame\.elapsed" skills/phase/references/  # frame timing across loop primitives
grep -ri "starting:opacity\|data-\[phase=exiting\]" skills/phase/references/  # the canonical CSS transition pattern
```

## Cross-cutting references

| Reference                                               | Use when                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| [decision-guide.md](references/decision-guide.md)       | Choosing between CSS, phase, or an external library                  |
| [rendering-recipes.md](references/rendering-recipes.md) | Composing `Defer` / `WhenIdle` / `WhenVisible` / `useRenderState`    |
| [performance.md](references/performance.md)             | Writing or reviewing hot-path animation code                         |
| [audit.md](references/audit.md)                         | Auditing existing animations for optimization opportunities          |
| [abort-signals.md](references/abort-signals.md)         | Tearing down core primitives with an `AbortSignal` (`signal` option) |

## Full compiled document

For all references expanded inline: `AGENTS.md`
