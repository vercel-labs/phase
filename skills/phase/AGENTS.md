<!-- GENERATED — do not edit. Run: node skills/phase/scripts/build-agents.mjs -->

---

name: phase
description: "Use when building, reviewing, or optimizing web animations OR rendering performance — frame loops, scroll/viewport reveals, mount/unmount transitions, canvas/WebGL lifecycles, reduced-motion handling, lazy rendering, deferring off-screen or non-critical work — with the phase library. Also use when auditing existing animation or rendering code to decide between CSS-only, minimal JS, phase, or a heavier library like motion. Trigger on janky animations, per-frame allocations, forced reflows, re-renders from animation loops, animations that don't pause off-screen, missing reduced-motion support, content-visibility, lazy-mounting on viewport or idle, requestIdleCallback, deferring rendering of long pages, or questions like 'should I use CSS or JS for this animation' or 'how do I render this off-screen content faster'. Always use this skill when the user mentions phase or any phase export."
license: MIT
metadata:
author: vercel
version: '0.1.0'
abstract: 'Lifecycle-aware animation and rendering skill — implement phase primitives correctly, follow performant-animation and render-gating best practices, and audit existing code to recommend CSS-only, minimal JS, phase, or an external library.'

---

# phase

The lifecycle-aware performance layer for the web. Know when to animate, when to render, and when to pause. phase composes lifecycle signals (visibility, reduced motion, frame budget) so animations pause when unseen, respect reduced motion, never force a reflow, never re-render from the frame loop, and skip rendering off-screen or non-critical content. This skill helps you implement phase primitives correctly, preserve those performance guarantees, and audit existing code to recommend the cheapest sufficient approach.

## The animation ladder

Always prefer the cheapest tier that satisfies the requirement. Never recommend phase where CSS suffices; never recommend an external library where phase suffices.

| Tier                 | When                                                                           | Tools                                                                                          |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **CSS-only**         | Enter/exit, hover, state toggles, simple transforms                            | `transition`, `@starting-style`, `animation`, View Transitions API                             |
| **Minimal JS**       | One value into React render, no per-frame DOM writes                           | `useTween` (or CSS if render cost is trivial)                                                  |
| **phase**            | Per-frame JS, visibility pausing, canvas, lifecycle-aware loops, render gating | `useLoop`, `useCanvas`, `useLifecycle`, `Presence`, `Swap`, `WhenVisible`, `WhenIdle`, `Defer` |
| **External library** | Spring physics, gesture systems, declarative keyframe orchestration            | `motion`, GSAP, etc.                                                                           |

For the full decision tree: read [references/decision-guide.md](references/decision-guide.md). This ladder ranks _animation_ cost; rendering work runs on a parallel track, covered in the Rendering section below.

## Rendering: when to render, not just when to animate

phase is the _when_ layer — when to animate, when to render, when to pause — from one set of signals. Three helpers skip increasing amounts of work for off-screen content:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Reach for it when                                  |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

`Defer` is the cheapest and safest (keeps content, skips paint). `When*` save the most (no DOM until triggered). None of these affect layout or CLS.

Two idle hooks defer work off the critical path: `useIdle` gates rendering with a boolean once the browser is idle, and `useWhenIdle` runs a side effect (prefetch, `import()`) once idle. `useRenderState(ref)` reads a `Defer` subtree's render-skip state to pause **raw, non-phase** work (a hand-written rAF loop, `setInterval`) — phase's own loops already self-pause off-screen.

## Choosing a primitive

The ladder picks a _tier_; this table picks the _primitive_ once phase is the right tier.

| Need                                                | Use                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| Know if it's on screen?                             | `useSight`                                                              |
| Want phase to run your frame loop?                  | `useLoop` (DOM) / `useCanvas` (canvas)                                  |
| You own the loop (WebGL, three.js, Web Worker)?     | `useLifecycle` (active/paused signal)                                   |
| Animating one value into render?                    | `useTween`                                                              |
| Mount/unmount transitions?                          | `Presence` / `Swap` / `WhenVisible`                                     |
| Skip painting off-screen content (keep in DOM)?     | `Defer`                                                                 |
| Mount non-critical UI when idle?                    | `WhenIdle` / `useIdle`                                                  |
| Run a side effect (prefetch, `import()`) when idle? | `useWhenIdle`                                                           |
| Pause raw work inside a `Defer` subtree?            | `useRenderState`                                                        |
| Reactive scroll/size/media values?                  | `useScrollProgress` / `useSize` / `useContainerQuery` / `useMediaQuery` |

## Non-negotiable invariants

These are tested guarantees for animation hot paths. Violating them in consumer code is always a bug. (Rendering helpers carry one rule of their own: reserve fallback height so `WhenVisible` / `WhenIdle` don't shift layout — see [references/rendering-recipes.md](references/rendering-recipes.md).)

1. **Zero per-frame allocations** — no objects, arrays, closures, template literals, or spreads in `onTick`/`draw`.
2. **Never `setState` inside `onTick`** — write to refs or the DOM directly. Only phase changes trigger re-renders.
3. **No forced reflows** — never call `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` in animation paths. Use `useSize` / ResizeObserver.
4. **Strong pause** — `cancelAnimationFrame()` stops scheduling entirely. Zero callbacks, zero CPU when paused.
5. **Reduced motion by default** — all primitives respect `prefers-reduced-motion: reduce` automatically. Bypassing requires explicit `reducedMotion: 'ignore'`.
6. **Frame-locked shared clock** — one `performance.now()` per rAF frame. Multiple animations stay in sync.

For the full performance ruleset (impact-ranked): read [references/performance.md](references/performance.md).

## Audit

When asked to review, optimize, or audit animation code, follow [references/audit.md](references/audit.md). It provides a repeatable procedure backed by a deterministic scanner (`scripts/scan.mjs`) that surfaces anti-pattern candidates before judgment.

## API reference index

Each export has its own reference file. Read the relevant file when implementing or advising on that export.

### Core (`phase`)

| Export                        | Read when…                                           | Reference                                                         |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `createLoop`                  | Building a lifecycle-aware rAF animation loop        | [create-loop.md](references/create-loop.md)                       |
| `createTicker`                | Need a raw frame clock without visibility management | [create-ticker.md](references/create-ticker.md)                   |
| `createSight`                 | Observing element visibility (viewport + document)   | [create-sight.md](references/create-sight.md)                     |
| `createLifecycle`             | Providing active/paused signal to your own renderer  | [create-lifecycle.md](references/create-lifecycle.md)             |
| `createScrollProgress`        | Tracking intersection ratio (0–1) for reveals        | [create-scroll-progress.md](references/create-scroll-progress.md) |
| `createRenderState`           | Observing `content-visibility` render-skip state     | [create-render-state.md](references/create-render-state.md)       |
| `whenIdle`                    | Running a one-off callback when the browser is idle  | [when-idle.md](references/when-idle.md)                           |
| `prefersReducedMotion`        | Gating expensive setup or conditional imports        | [prefers-reduced-motion.md](references/prefers-reduced-motion.md) |
| `PhaseError` / `isPhaseError` | Handling or classifying phase errors                 | [errors.md](references/errors.md)                                 |

### React (`phase/react`)

| Export              | Read when…                                         | Reference                                                   |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `useLoop`           | Animating DOM elements in a per-frame loop         | [use-loop.md](references/use-loop.md)                       |
| `useCanvas`         | Canvas/WebGL animation with DPR + resize handling  | [use-canvas.md](references/use-canvas.md)                   |
| `useLifecycle`      | Gating a renderer you own (three.js, Pixi, WebGL)  | [use-lifecycle.md](references/use-lifecycle.md)             |
| `useSight`          | Tracking visibility as a reactive phase            | [use-sight.md](references/use-sight.md)                     |
| `useTween`          | Animating a single number into React render output | [use-tween.md](references/use-tween.md)                     |
| `usePresence`       | Custom mount/unmount transitions (full control)    | [use-presence.md](references/use-presence.md)               |
| `useScrollProgress` | Driving opacity/reveals from intersection ratio    | [use-scroll-progress.md](references/use-scroll-progress.md) |
| `useRenderState`    | Pausing raw work when a `Defer` subtree is skipped | [use-render-state.md](references/use-render-state.md)       |
| `useIdle`           | Boolean that flips true once the browser is idle   | [use-idle.md](references/use-idle.md)                       |
| `useWhenIdle`       | Run a side effect (prefetch, `import()`) once idle | [use-when-idle.md](references/use-when-idle.md)             |
| `useSize`           | Reading element dimensions without reflows         | [use-size.md](references/use-size.md)                       |
| `useContainerQuery` | Breakpoint matching against element width/height   | [use-container-query.md](references/use-container-query.md) |
| `useMediaQuery`     | Reactive CSS media query subscription              | [use-media-query.md](references/use-media-query.md)         |
| `useSyncedRef`      | Keeping a ref always in sync with latest value     | [use-synced-ref.md](references/use-synced-ref.md)           |
| `useStableCallback` | Stable-identity function for memo'd children       | [use-stable-callback.md](references/use-stable-callback.md) |
| `Presence`          | Simple show/hide with enter/exit transitions       | [presence.md](references/presence.md)                       |
| `WhenVisible`       | Viewport-gated lazy mount (one-shot)               | [when-visible.md](references/when-visible.md)               |
| `WhenIdle`          | Idle-gated lazy mount for non-critical UI          | [when-idle.md](references/when-idle.md)                     |
| `Defer`             | Skip painting off-screen content (keep in DOM)     | [defer.md](references/defer.md)                             |
| `Swap`              | Coordinated exit-then-enter between N states       | [swap.md](references/swap.md)                               |

### Ease (`phase/ease`)

| Export            | Read when…                                             | Reference                     |
| ----------------- | ------------------------------------------------------ | ----------------------------- |
| All easing + math | Computing animated values (lerp, clamp, easing curves) | [ease.md](references/ease.md) |

### Quick search

For concepts that span multiple references, grep is faster than guessing which file to open:

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

| Reference                                               | Read when…                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [decision-guide.md](references/decision-guide.md)       | Choosing between CSS, phase, or an external library               |
| [rendering-recipes.md](references/rendering-recipes.md) | Composing `Defer` / `WhenIdle` / `WhenVisible` / `useRenderState` |
| [performance.md](references/performance.md)             | Writing or reviewing hot-path animation code                      |
| [audit.md](references/audit.md)                         | Auditing existing animations for optimization opportunities       |

## Full compiled document

For all references expanded inline: `AGENTS.md`

---

# Animation audit procedure

A repeatable procedure for auditing existing animation code. Surfaces anti-pattern candidates deterministically, then classifies each against the [decision guide](./decision-guide.md) ladder.

## When to run

- User asks to review, optimize, or audit animation code.
- User reports janky animations, high CPU usage, or excessive re-renders.
- User asks "can this use CSS instead?" or "should I use phase here?"
- User asks to replace an existing animation library with phase.

## Step 1: Scan for candidates

Run the deterministic scanner bundled with this skill on the target directory. The script lives at `scripts/scan.mjs` relative to this skill's directory — resolve it from wherever the skill is installed (e.g. `skills/phase/scripts/scan.mjs` in the phase repo, or `.agents/skills/phase/scripts/scan.mjs` in a consuming project):

```bash
node <skill-dir>/scripts/scan.mjs <target-dir>
```

The scanner greps for these anti-pattern signals:

| Signal                      | Pattern                                                                                                                  | Why it's a problem                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Manual rAF loop             | `requestAnimationFrame` without phase                                                                                    | No visibility pausing, no shared clock, no cleanup |
| `setState` in rAF           | `setState`/`dispatch` inside `requestAnimationFrame` callback                                                            | 60 re-renders/sec                                  |
| Forced reflow               | `getBoundingClientRect`, `offsetWidth`, `offsetHeight`, `getComputedStyle`, `scrollWidth`, `clientWidth` in `.ts`/`.tsx` | Synchronous layout thrashing                       |
| Raw IntersectionObserver    | `new IntersectionObserver`                                                                                               | Missing pooling, manual cleanup                    |
| Raw ResizeObserver          | `new ResizeObserver`                                                                                                     | Missing pooling, manual cleanup                    |
| JS-driven opacity/transform | `style.opacity =` or `style.transform =` with no visibility gating                                                       | Could be CSS, or needs phase for lifecycle         |
| Missing reduced motion      | Animation code without `prefers-reduced-motion` or phase primitives                                                      | Accessibility gap                                  |
| Background animation        | `setInterval`/`setTimeout` for animation without visibility check                                                        | Wastes CPU off-screen                              |
| Reflow for visibility check | `getBoundingClientRect()` used to determine if element is in view                                                        | Forces synchronous layout; IO is one frame away    |
| Permanent `will-change`     | `will-change-transform` always on, not toggled with animation state                                                      | Wastes GPU memory when idle                        |
| Manual visibility gate      | Hand-wired IO + visibilitychange + reduced motion to produce a boolean                                                   | Reimplements `useLifecycle`; fragile, verbose      |

Output is a list of candidate sites: `file:line` with the matched pattern.

If `scan.mjs` is not available (e.g. the skill is loaded without scripts), perform the scan manually by searching for the patterns above in the target codebase.

## Step 2: Classify each candidate

For each candidate site, determine the best tier from the ladder:

```
CSS-only  →  Minimal JS (useTween)  →  phase primitives  →  External library  →  No change
```

### Classification questions

1. **Can CSS do this alone?** (state toggle, pseudo-class, enter/exit via `@starting-style`, simple transform/opacity)
   → Recommend CSS-only. Remove the JS.

2. **Is it a single numeric value into React render?** (counter, progress bar, opacity from data)
   → Recommend `useTween`.

3. **Does it need per-frame JS, visibility pausing, or lifecycle awareness?**
   → Recommend phase (`useLoop`, `useCanvas`, `useLifecycle`, `Presence`, `Swap`, `WhenVisible`).

4. **Does it need springs, gestures, or keyframe orchestration?**
   → Recommend keeping/adding an external library. Optionally wrap with `useLifecycle` for visibility management.

5. **Is the current implementation already optimal?**
   → Recommend no change. Document why.

## Step 3: Emit recommendations

For each finding, emit a structured recommendation:

````
### [file:line] — <brief description>

**Current pattern:** <what's there now, 1-2 lines>
**Problem:** <what's wrong and why it matters>
**Recommendation:** <CSS-only | useTween | useLoop | useCanvas | useLifecycle | Presence | Swap | WhenVisible | external library | no change>
**Why this tier:** <one sentence justifying the choice>

Before:
​```tsx
// existing code (minimal, just the relevant part)
​```

After:
​```tsx
// recommended replacement
​```
````

## Rules

- **Never recommend a higher tier than needed.** CSS-only is always preferred when it works.
- **Never recommend phase where CSS suffices.** If `transition: opacity 300ms` does the job, say so.
- **Never recommend an external library where phase suffices.** If it doesn't need springs or gestures, phase is enough.
- **"No change" is a valid recommendation.** If the code is already optimal, say so and move on.
- **Always address reduced motion.** If the candidate has no reduced-motion handling, the recommendation must include it.
- **Always address cleanup.** If the candidate leaks listeners/observers/rAF handles, the recommendation must include proper teardown.
- **Show before/after code.** Keep snippets minimal — just the relevant change, not the entire file.

## Common replacements

| Current pattern                                                      | Replace with                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | `useLoop` (if DOM) or `useCanvas` (if canvas)                     |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same — plus the cleanup is now automatic                          |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                      |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                               |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                         |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)       |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                        |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                   |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                      |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                     |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                       |
| CSS-only animation that's working fine                               | No change — don't add JS where it's not needed                    |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` — single hook, same signals, pooled IO             |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`           |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops      |
| `setInterval` rotation with visibility gating                        | CSS `@keyframes` + `useLifecycle` toggling `animation-play-state` |

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical** — causes jank or accessibility failures
2. **High** — wastes significant CPU or leaks resources
3. **Medium** — suboptimal but functional
4. **No change** — already well-implemented (list briefly for completeness)

End with a summary: "Found N candidates, M actionable, K already optimal."

---

# `createLifecycle`

The activation decision for an animation, decoupled from who drives the frames. Composes visibility (`createSight`), reduced motion, and a manual pause into a single `active` / `paused` phase.

## Signature

```ts
import { createLifecycle } from 'phase';

const lifecycle = createLifecycle(options: LifecycleOptions): Lifecycle;
```

### Options

| Option                | Type                                                       | Default   | Description                                 |
| --------------------- | ---------------------------------------------------------- | --------- | ------------------------------------------- |
| `element`             | `Element`                                                  | required  | Element to observe for visibility           |
| `reducedMotion`       | `'pause' \| 'ignore'`                                      | `'pause'` | Whether reduced motion pauses the lifecycle |
| `intersectionOptions` | `IntersectionObserverInit`                                 | —         | Forwarded to pooled IO                      |
| `start`               | `'auto' \| 'manual'`                                       | `'auto'`  | Whether to start immediately                |
| `onPhaseChange`       | `(phase: LifecyclePhase, reason: LifecycleReason) => void` | —         | Called on phase transitions                 |

### Return (Lifecycle)

| Property      | Type              | Description                                                                                    |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `start()`     | `() => void`      | Begin honoring signals (auto by default)                                                       |
| `stop()`      | `() => void`      | Terminal — disposes observers and listeners                                                    |
| `pause()`     | `() => void`      | Manual pause (lowest priority)                                                                 |
| `resume()`    | `() => void`      | Clear manual pause                                                                             |
| `phase`       | `LifecyclePhase`  | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason` | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |

## When to use

- You own your render loop (three.js, Pixi, WebGL, a Web Worker) and need phase's lifecycle guarantees without phase driving the clock.
- You want visibility pausing + reduced-motion pausing + manual pause composed into one signal.
- You need `pause()` / `resume()` for UI-driven suspension (e.g. a settings panel covering the animation).

## When NOT to use — reach for X instead

| Instead of this                          | Use                                              |
| ---------------------------------------- | ------------------------------------------------ |
| You want phase to drive the loop for you | `createLoop` — adds the ticker + quality signals |
| Just need visibility (no reduced motion) | `createSight` — simpler, no motion handling      |
| React component                          | `useLifecycle` — manages refs and teardown       |

## Do

- React to `onPhaseChange` to start/stop your renderer:
  ```ts
  onPhaseChange: (phase) => {
    if (phase === 'active') renderer.start();
    else renderer.stop();
  };
  ```
- Use `pause()` / `resume()` for contextual suspension (modal open, panel covers animation).
- Trust pause priority: `reduced-motion` > `sight` > `manual`. If multiple pause reasons apply, the highest-priority one is reported.

## Don't

- **Don't use `pause()` to implement visibility pausing** — visibility is automatic via the internal `createSight`. Manual pause is for UI-driven scenarios only.
- **Don't call `start()` after `stop()`** — `stop()` is terminal.
- **Don't confuse with `createLoop`** — lifecycle gives you a signal; loop gives you a signal AND drives the frames.

## Reduced motion

Default: `'pause'` — the lifecycle reports `phase: 'paused'`, `phaseReason: 'reduced-motion'` when the user enables reduced motion. Your renderer should stop.

With `reducedMotion: 'ignore'`: lifecycle stays `active` regardless. Use only for non-decorative motion.

## See also

- [createLoop](./create-loop.md) — builds on createLifecycle; adds ticker, quality, frame budget
- [createSight](./create-sight.md) — pure visibility (no reduced motion handling)
- [useLifecycle](./use-lifecycle.md) — React hook wrapping createLifecycle

---

# `createLoop`

The main primitive. Composes a ticker, visibility observer, reduced-motion listener, and quality signals into a lifecycle-aware animation loop.

## Signature

```ts
import { createLoop } from 'phase';

const loop = createLoop(options: LoopOptions): Loop;
```

### Options

| Option                | Type                                | Default      | Description                               |
| --------------------- | ----------------------------------- | ------------ | ----------------------------------------- |
| `element`             | `Element`                           | required     | Element to observe for visibility         |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called each frame while running           |
| `fps`                 | `number`                            | —            | Cap frames per second                     |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior when user prefers reduced motion |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades            |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode         |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to the underlying IO            |
| `start`               | `'auto' \| 'manual'`                | `'auto'`     | Whether to start immediately              |
| `onPhaseChange`       | `(phase, reason) => void`           | —            | Called on every phase transition          |

### Return (Loop)

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `start()`       | `() => void`                  | Begin the loop (no-op if already running)      |
| `stop()`        | `() => void`                  | Terminal — disposes everything                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- You need a per-frame animation loop that automatically pauses when off-screen or in a background tab.
- You want zero CPU when the element isn't visible (strong pause via `cancelAnimationFrame`).
- You need quality degradation signals (FPS throttle on window blur or frame budget overflow).
- You're animating DOM elements (transforms, opacity, positions) in a frame loop.

## When NOT to use — reach for X instead

| Instead of this                                   | Use                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| You own the renderer (three.js, Pixi, Web Worker) | `createLifecycle` — gives you active/paused signal without driving the loop |
| Single value into React render                    | `useTween` — simpler, calls setState                                        |
| Pure CSS can do it                                | CSS `transition` / `animation` / `@starting-style`                          |
| Need springs or gesture-driven animation          | External library (motion, GSAP)                                             |
| React component                                   | `useLoop` — same engine with React lifecycle management                     |

## Do

- Write to DOM directly inside `onTick`:
  ```ts
  onTick: (frame) => {
    el.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
  };
  ```
- Call `stop()` when the animation is permanently done (e.g. component unmounts, page navigates away).
- Read `phase` and `phaseReason` to debug unexpected pauses.
- Use `degraded: 'pause'` for heavy canvas/WebGL that can't gracefully degrade.

## Don't

- **Never call React `setState` inside `onTick`** — it fires 60 times/sec. Write to refs or DOM directly.
- **Never allocate inside `onTick`** — no objects, arrays, closures, template literals, or spreads. `FrameState` is mutated in place; reuse external variables.
- **Never store a reference to `frame`** — it's the same object every tick, mutated in place. Read values immediately.
- **Don't call `start()` after `stop()`** — `stop()` is terminal. Create a new loop instance.
- **Don't use `createLoop` without an element** — throws `PhaseError` with code `no_element`.

## Reduced motion

Default: `'pause'` — the loop pauses entirely when the user enables reduced motion. The `phaseReason` will be `'reduced-motion'`.

- `'complete'`: Jump to the end state instantly (useful for tweens that have a target). The loop runs one final tick then stops.
- `'ignore'`: Keep running regardless. Use only for non-decorative motion (e.g. a data visualization that conveys information via movement).

## See also

- [createTicker](./create-ticker.md) — the low-level rAF clock underneath createLoop; use when you don't need visibility management
- [createLifecycle](./create-lifecycle.md) — the activation signal without the ticker; use when you own the render loop
- [useLoop](./use-loop.md) — React hook wrapping createLoop with ref management
- [useCanvas](./use-canvas.md) — React hook for canvas/WebGL with DPR handling on top of createLoop

---

# `createRenderState`

Reports whether the browser is rendering an element or skipping it under `content-visibility`. Listens to `contentvisibilityautostatechange` — the browser's ground-truth paint decision. Framework-agnostic core primitive; `useRenderState` wraps it for React.

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

| Option          | Type                           | Default  | Description                            |
| --------------- | ------------------------------ | -------- | -------------------------------------- |
| `element`       | `Element`                      | required | Element under `content-visibility`     |
| `onPhaseChange` | `(phase: RenderPhase) => void` | —        | Called on each render-state transition |

### Phases

| Phase        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `'rendered'` | Browser is rendering the element (initial + default) |
| `'skipped'`  | Browser is skipping rendering (off-screen)           |

## When to use

- Pause raw, non-phase work (a hand-written rAF loop, `setInterval`, expensive effects) when a `Defer` subtree stops painting.
- React to the browser's actual paint decision rather than an IntersectionObserver approximation.

## When NOT to use — reach for X instead

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

- **Don't reach for it to "keep phase animations alive"** — `useLoop`/`useCanvas`/`useLifecycle` already self-pause off-screen via `createSight`.
- **Don't mutate layout or unmount on `skipped`** — that reintroduces layout shift.

## Does this affect layout or CLS?

No. It only listens and reports. Reacting by pausing CPU work has zero layout effect — the no-layout-shift guarantee of `content-visibility` stays intact.

## Reduced motion

Not applicable — render-state is a paint signal, not an animation.

## See also

- [use-render-state](./use-render-state.md) — the React hook wrapper
- [defer](./defer.md) — the `content-visibility` component this observes
- [create-sight](./create-sight.md) — viewport visibility, the IO-based sibling signal

---

# `createScrollProgress`

Reports what fraction of an element is currently visible in the viewport (0–1) via the shared IntersectionObserver pool. Zero forced reflows, zero extra observers.

## Signature

```ts
import { createScrollProgress } from 'phase';

const progress = createScrollProgress(options: ScrollProgressOptions): ScrollProgress;
```

### Options

| Option       | Type                          | Default  | Description                                                     |
| ------------ | ----------------------------- | -------- | --------------------------------------------------------------- |
| `element`    | `Element`                     | required | Element to observe                                              |
| `onProgress` | `(ratio: number) => void`     | required | Called at each threshold crossing                               |
| `steps`      | `number`                      | `20`     | Number of evenly-spaced thresholds (21 values: 0%, 5%, …, 100%) |
| `root`       | `Element \| Document \| null` | —        | IO root element                                                 |
| `rootMargin` | `string`                      | —        | IO root margin                                                  |

### Return (ScrollProgress)

| Property | Type         | Description                                   |
| -------- | ------------ | --------------------------------------------- |
| `ratio`  | `number`     | Current intersection ratio (synchronous read) |
| `stop()` | `() => void` | Unobserve and cleanup                         |

## When to use

- Reveal/opacity effects based on how much of an element is visible.
- Progress indicators tied to element viewport coverage.
- Parallax-like effects driven by intersection ratio.

## When NOT to use — reach for X instead

| Instead of this                                           | Use                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Continuous scroll-scrubbing (scroll position as progress) | `motion`'s `useScroll` or native `ScrollTimeline` API |
| Boolean visibility (in view or not)                       | `createSight`                                         |
| React component                                           | `useScrollProgress`                                   |

**Important limitation:** `intersectionRatio` plateaus for tall elements once they fill the viewport. This is NOT a scroll-position tracker — it's a visibility-fraction tracker. For scroll-driven animation of tall content, use `ScrollTimeline`.

## Do

- Use for reveal effects (fade in as element enters viewport):
  ```ts
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  };
  ```
- Multiple instances with the same `steps` share a single IntersectionObserver — no performance penalty for many elements.
- Read `progress.ratio` synchronously when you need the current value outside the callback.

## Don't

- **Don't use for full scroll-scrubbing** — ratio plateaus for tall elements. Use ScrollTimeline.
- **Don't set `steps` extremely high** (e.g. 1000) — creates that many thresholds. 20–50 is appropriate for smooth visual results.
- **Don't call `getBoundingClientRect()` as a workaround** — that forces a reflow. Trust the async IO callback.

## Reduced motion

`createScrollProgress` does not automatically handle reduced motion — it reports a ratio. If the consumer is using the ratio for decorative animation, they should check `prefersReducedMotion()` and skip the animation.

## See also

- [useScrollProgress](./use-scroll-progress.md) — React hook wrapping createScrollProgress
- [createSight](./create-sight.md) — boolean visibility (visible/hidden) instead of ratio
- [prefers-reduced-motion](./prefers-reduced-motion.md) — check before animating with the ratio

---

# `createSight`

Answers one question: can the user see this element right now? Combines `document.visibilitychange`, `pageshow` (bfcache restore), and pooled `IntersectionObserver` into a single phase.

## Signature

```ts
import { createSight } from 'phase';

const sight = createSight(options: SightOptions): Sight;
```

### Options

| Option                | Type                                               | Default  | Description                      |
| --------------------- | -------------------------------------------------- | -------- | -------------------------------- |
| `element`             | `Element`                                          | required | Element to observe               |
| `intersectionOptions` | `IntersectionObserverInit`                         | —        | Forwarded to pooled IO           |
| `onPhaseChange`       | `(phase: SightPhase, reason: SightReason) => void` | —        | Called on visibility transitions |

### Return (Sight)

| Property      | Type          | Description                                                          |
| ------------- | ------------- | -------------------------------------------------------------------- |
| `phase`       | `SightPhase`  | `'unknown' \| 'visible' \| 'hidden'`                                 |
| `phaseReason` | `SightReason` | `'initial' \| 'viewport' \| 'document' \| 'bfcache' \| 'all-hidden'` |
| `stop()`      | `() => void`  | Dispose all listeners and observers                                  |

## When to use

- Lazy-mounting content when it enters the viewport.
- Analytics (tracking element impressions).
- Gating non-animation work (data loading, video playback).
- You need to know _why_ something became visible/hidden (viewport vs. tab switch vs. bfcache).

## When NOT to use — reach for X instead

| Instead of this                               | Use                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| Gating an animation loop                      | `createLifecycle` — adds reduced-motion handling + manual pause |
| React component that needs visibility boolean | `useSight`                                                      |
| Lazy-mount children on viewport entry         | `WhenVisible` component                                         |
| Intersection ratio (scroll progress)          | `createScrollProgress`                                          |

## Do

- Rely on observer pooling: 20 elements with the same `intersectionOptions` share one `IntersectionObserver` instance.
- Use `onPhaseChange` instead of polling `phase` — it fires only on transitions.
- Call `stop()` in cleanup to free the observer slot.

## Don't

- **Don't use for animations directly** — `createSight` doesn't know about reduced motion. For animation gating, use `createLifecycle` which composes sight + reduced motion.
- **Don't create raw `IntersectionObserver` instances** — use `createSight` (or `createScrollProgress`) to benefit from the shared pool.
- **Don't call in SSR** — throws `PhaseError` with code `server_context`.

## Reduced motion

`createSight` does not handle reduced motion. It reports pure visibility. If you need to gate an animation, use `createLifecycle` which folds in the reduced-motion signal.

## See also

- [createLifecycle](./create-lifecycle.md) — composes sight + reduced motion + manual pause
- [useSight](./use-sight.md) — React hook wrapping createSight
- [createScrollProgress](./create-scroll-progress.md) — intersection ratio instead of boolean visibility
- [when-visible](./when-visible.md) — React component for viewport-gated lazy mounting

---

# `createTicker`

The low-level rAF clock underneath `createLoop`. Use when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

## Signature

```ts
import { createTicker } from 'phase';

const ticker = createTicker(options: TickerOptions): Ticker;
```

### Options

| Option   | Type                          | Default      | Description        |
| -------- | ----------------------------- | ------------ | ------------------ |
| `fps`    | `number`                      | — (uncapped) | Cap frame rate     |
| `onTick` | `(frame: FrameState) => void` | required     | Called every frame |

### Return (Ticker)

| Property      | Type           | Description                                                     |
| ------------- | -------------- | --------------------------------------------------------------- |
| `start()`     | `() => void`   | Begin ticking                                                   |
| `stop()`      | `() => void`   | Terminal — cannot restart                                       |
| `pause()`     | `() => void`   | Strong pause (cancels rAF subscription)                         |
| `resume()`    | `() => void`   | Resume from pause                                               |
| `phase`       | `TickerPhase`  | `'idle' \| 'running' \| 'paused' \| 'stopped'`                  |
| `phaseReason` | `TickerReason` | `'initial' \| 'started' \| 'resumed' \| 'manual' \| 'disposed'` |

### FrameState

| Field     | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `time`    | `number` | Current `performance.now()`              |
| `delta`   | `number` | ms since last tick (clamped to 40ms max) |
| `elapsed` | `number` | ms since start, excluding paused time    |
| `frame`   | `number` | Frame count since start                  |

## When to use

- You need a frame loop that does NOT depend on element visibility (audio timing, physics simulation, background computation).
- You want FPS capping with a shared clock.
- You're building a custom animation system on top of phase's clock infrastructure.

## When NOT to use — reach for X instead

| Instead of this                 | Use                                                  |
| ------------------------------- | ---------------------------------------------------- |
| Animation tied to a DOM element | `createLoop` — adds visibility pausing automatically |
| React component                 | `useLoop` — manages refs and teardown                |
| Single numeric tween            | `useTween`                                           |

## Do

- Use `pause()` / `resume()` for intentional suspension (e.g. user pauses a game).
- Rely on the shared clock: all tickers read the same `performance.now()` per frame, so multiple animations stay in sync.
- Trust delta clamping: after a long pause, `frame.delta` is clamped to 40ms — no teleporting.

## Don't

- **Never call `start()` or `resume()` on a stopped ticker** — throws `PhaseError` with code `ticker_stopped`. Create a new instance.
- **Never store a reference to `frame`** — same object every tick, mutated in place.
- **Never allocate inside `onTick`** — zero-allocation contract applies here too.
- **Don't use `createTicker` for DOM animations** — without visibility management, your loop keeps burning CPU when off-screen. Use `createLoop`.

## Reduced motion

`createTicker` does NOT handle reduced motion — it has no element or visibility concept. If you need reduced-motion awareness, use `createLoop` or `createLifecycle` instead.

## See also

- [createLoop](./create-loop.md) — builds on createTicker with visibility + reduced motion + quality signals
- [useLoop](./use-loop.md) — React hook wrapping createLoop

---

# Decision guide

How to choose between CSS-only, minimal JS, phase, or an external animation library.

## The ladder

Always prefer the cheapest tier. Moving up the ladder adds JS, runtime cost, and bundle weight — only justified when the lower tier genuinely cannot do the job.

```
CSS-only  →  Minimal JS (useTween)  →  phase primitives  →  External library
```

### Tier 1: CSS-only (no JS)

Use when the animation:

- Is triggered by a state class, pseudo-class, or attribute change (`:hover`, `data-*`, `[open]`)
- Is a pure enter/exit transition (`@starting-style` + `transition`, or `animation`)
- Uses View Transitions API for route/page changes
- Has no per-frame logic, no conditional behavior, no dependency on elapsed time

Examples: fade in on mount, slide on hover, opacity toggle, cross-fade between routes.

CSS animations are free at runtime (composited by the browser, off main thread for `transform`/`opacity`). No bundle cost. No cleanup. Always the first thing to try.

### Tier 2: Minimal JS (`useTween`)

Use when:

- You need to animate a single numeric value into React render output (counter, progress bar, opacity driven by data)
- The render is cheap (one element, minimal diffing)
- You do NOT need per-frame DOM writes, canvas, or visibility-aware pausing

`useTween` calls `setState` per frame — acceptable only when the render tree below it is small. If the animated value drives a large subtree, move to Tier 3 (`useLoop` with ref-based DOM writes).

Reduced motion: jumps to target instantly (value still arrives, animation skipped).

### Tier 3: phase primitives

Use when you need any of:

- Per-frame DOM manipulation (transforms, canvas draws, WebGL)
- Visibility-aware pausing (zero CPU off-screen)
- Lifecycle signals for an external renderer (three.js, Pixi, Web Worker)
- Mount/unmount transitions with exit animations
- Scroll-driven reveals, element sizing, or media-query reactivity

| Scenario                            | Primitive                      |
| ----------------------------------- | ------------------------------ |
| DOM animation loop                  | `useLoop`                      |
| Canvas/WebGL loop                   | `useCanvas`                    |
| Signal for your own renderer        | `useLifecycle`                 |
| Mount/unmount with exit             | `Presence`, `usePresence`      |
| Swap between states with exit→enter | `Swap`                         |
| Lazy mount on viewport entry        | `WhenVisible`                  |
| Lazy mount when the browser is idle | `WhenIdle`, `useIdle`          |
| Prefetch / side effect when idle    | `useWhenIdle`                  |
| Skip painting off-screen (keep DOM) | `Defer`                        |
| Pause raw work inside a `Defer`     | `useRenderState`               |
| Visibility ratio (reveal effects)   | `useScrollProgress`            |
| Element dimensions                  | `useSize`, `useContainerQuery` |
| Media query subscription            | `useMediaQuery`                |
| Visibility boolean                  | `useSight`                     |

All phase primitives share:

- Zero per-frame allocations
- Automatic reduced-motion handling
- Pooled observers (IO/RO/MQL — no raw `new IntersectionObserver`)
- Clean teardown on unmount

### Rendering: when to render, not just when to animate

phase's rendering helpers apply the same lifecycle signals to _rendering_ work. Choose by how aggressively you can skip work and whether the content must exist for SSR:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Use when                                           |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

- **`Defer` is the safest default** — children stay server-rendered and keep their reserved box (`contain-intrinsic-size: auto <est>`), so no layout shift. It defers rendering only, never hydration or mounting.
- **`WhenIdle` / `WhenVisible` save more** but their children are absent from SSR HTML — reserve them for non-critical content.

For multi-signal rendering patterns — two-tier `Defer` + `WhenVisible`, idle-gated `lazy()`, gating raw loops with `useRenderState`, and what _not_ to compose — see [rendering-recipes.md](./rendering-recipes.md).

### Tier 4: External library

Use when you need:

- Spring physics (mass, tension, damping, velocity-aware interruption)
- Gesture systems (drag, pinch, fling with momentum)
- Declarative keyframe orchestration (stagger, timeline, sequence)
- Layout animations (animating between measured positions)

Recommended: `motion` (formerly Framer Motion). Alternatives: GSAP, react-spring, @use-gesture.

phase does not handle these and will not grow to handle them. These are complementary, not competing.

## Quick-decision flowchart

1. Can CSS do it alone (state toggle, enter/exit, hover, view transition)? → **CSS-only.**
2. Is it one value into a cheap render? → **`useTween`** (or still CSS if the value maps to a CSS property).
3. Do you need per-frame JS, visibility pausing, canvas, or lifecycle signals? → **phase.**
4. Do you need springs, gestures, or keyframe orchestration? → **External library** (and phase can still manage the lifecycle around it via `useLifecycle`).

## Combining tiers

phase + external library is a valid pattern. Use `useLifecycle` to gate an external renderer:

```tsx
const { ref, isActive } = useLifecycle();

useEffect(() => {
  if (!isActive) return;
  const controls = animate(
    ref.current,
    { opacity: [0, 1] },
    { type: 'spring' },
  );
  return () => controls.stop();
}, [isActive]);
```

This gives you phase's visibility/reduced-motion/lifecycle management around an external animation engine.

### phase + CSS `animation-play-state`

For CSS-driven animations (keyframes, carousel rotations) that need visibility-aware pausing, use `useLifecycle` to toggle `animation-play-state`:

```tsx
const { ref, isActive } = useLifecycle({
  intersectionOptions: { rootMargin: '50px', threshold: 0.5 },
});

return (
  <div ref={ref}>
    <div
      className={cn(
        'motion-safe:[animation-name:rotate]',
        'motion-safe:[animation-iteration-count:infinite]',
        isActive
          ? 'will-change-transform motion-safe:[animation-play-state:running]'
          : 'motion-safe:[animation-play-state:paused]',
      )}
    />
  </div>
);
```

This is the right pattern when the animation itself is pure CSS (compositor-driven, no JS per frame) but needs lifecycle gating. Phase handles the visibility + reduced motion + document visibility decision; CSS handles the actual animation. No `setInterval`, no manual IO, no `requestAnimationFrame`.

### Server-rendered content + client animation gate

If the animated content is static data (CMS logos, images, text), render it on the server and wrap only the animation gate in a client component. This avoids hydrating the entire animated subtree.

```tsx
// Server component — renders logos, keyframes, structure (zero client JS)
function LogoRotator({ logos }) {
  const slots = buildLogoSlots(logos);
  const keyframes = buildKeyframes(logos.length);

  return (
    <>
      {keyframes && <style dangerouslySetInnerHTML={{ __html: keyframes }} />}
      <AnimationGate logoCount={logos.length}>
        <LogoStrip slots={slots} />
      </AnimationGate>
    </>
  );
}

// Client component — just the animation-play-state toggle
('use client');
function AnimationGate({ logoCount, children }) {
  const { ref, isActive } = useLifecycle();

  return (
    <div
      ref={ref}
      className={cn(
        'motion-safe:[animation-name:rotate]',
        'motion-safe:[animation-iteration-count:infinite]',
        isActive
          ? 'will-change-transform motion-safe:[animation-play-state:running]'
          : 'motion-safe:[animation-play-state:paused]',
      )}
    >
      {children}
    </div>
  );
}
```

The logos pass through as `children` — server-rendered HTML that React never hydrates or re-renders. The client component is a thin wrapper that toggles a CSS class. Benefits:

- Less JS shipped (no image component hydration)
- Faster TTI (content in initial HTML)
- No `useMemo` / `memo()` needed (server-rendered content doesn't re-render)
- Deterministic keyframe generation runs at build/request time, not in the browser

## When to replace existing code with phase

- Manual `requestAnimationFrame` loops without visibility pausing → `useLoop` / `useCanvas`
- Raw `IntersectionObserver` for visibility gating → `useSight` / `useLifecycle`
- Raw `ResizeObserver` for dimensions → `useSize`
- `setState` inside rAF → `useLoop` with ref-based DOM writes
- `getBoundingClientRect()` in animation paths → `useSize` (async, no reflow)
- Animations that keep running in background tabs → `useLoop` (auto-pauses)
- Missing `prefers-reduced-motion` handling → any phase primitive (automatic)
- Manual `transitionend` listeners for unmount → `Presence` / `Swap`

## When NOT to replace with phase

- CSS transitions that already work well — leave them alone
- Spring animations with interruption — keep your spring library
- Gesture-driven animations — keep your gesture library
- Server-side code that imports easing math — use `phase/ease` (no browser APIs)

## Common mistakes

- **Recommending phase for a CSS-only animation** — if `@starting-style` + `transition` or a simple `animation` handles the enter/exit, don't add JS. Phase is for when CSS genuinely can't do it.
- **Using `useLoop` when `useTween` is sufficient** — if you're animating one value into render output and the component is cheap, `useTween` is simpler and smaller. `useLoop` is for when you need ref-based DOM writes or many values.
- **Using `useLifecycle` expecting it to drive frames** — it only gives you an active/paused signal. It does not schedule `requestAnimationFrame`. Use `useLoop` or `useCanvas` when you want phase to drive the clock.
- **Forgetting that `createLoop` has no `pause()`/`resume()`** — it's signal-driven (visibility, reduced motion, quality). For manual control, use `createLifecycle` which exposes `pause()`/`resume()`, or use the React hook's `enabled` prop.
- **Reaching for an external library for enter/exit transitions** — `Presence`, `Swap`, and `WhenVisible` handle mount/unmount with CSS `@starting-style` + `transitionend`. You don't need a library for this.
- **Using `useScrollProgress` expecting continuous scroll-scrubbing** — it reports intersection ratio, which plateaus for tall elements. For scroll-position-driven animation, use `ScrollTimeline` or `motion`'s `useScroll`.

---

# `Defer`

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`. Pure CSS — no JS, no observer. Children stay in the DOM and are server-rendered.

## Signature

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="...">
  <ArticleSection />
</Defer>;
```

### Props

| Prop              | Type                                   | Default    | Description                                                 |
| ----------------- | -------------------------------------- | ---------- | ----------------------------------------------------------- |
| `estimatedHeight` | `string`                               | `'1000px'` | Reserved size before first paint (any CSS length)           |
| `ref`             | `Ref<HTMLDivElement>`                  | —          | Forward a ref (read render-skip state via `useRenderState`) |
| ...rest           | `Omit<ComponentProps<'div'>, 'style'>` | —          | Standard div props except `style` — use `className`         |

> **No `style` prop.** The render-skip styles (`content-visibility`, `contain-intrinsic-size`) are encapsulated so they can't be accidentally overridden. Style the wrapper with `className`.

## When to use

- Long pages with many off-screen sections (articles, feeds, docs).
- Heavy DOM subtrees that should exist and be crawlable but need not paint until near the viewport.
- You want to keep server-rendered HTML (SEO, deep links) while skipping render cost.

## When NOT to use — reach for X instead

| Instead of this                             | Use                                           |
| ------------------------------------------- | --------------------------------------------- |
| Avoid mounting / hydrating a subtree at all | `WhenVisible` (viewport) or `WhenIdle` (idle) |
| Lazy-load a code-split chunk                | `WhenVisible` + `lazy()` + `Suspense`         |
| Pause an animation off-screen               | phase loops self-pause; else `useRenderState` |

## Do

- **Reserve realistic space to avoid scrollbar jank:**
  ```tsx
  <Defer estimatedHeight="50vh">
    <Comments />
  </Defer>
  ```
- **Keep content that must be in the DOM** (SEO, in-page search, anchor links) — `Defer` SSRs its children.

## Don't

- **Don't expect it to defer hydration or mounting** — React still mounts and hydrates. It defers only the browser's rendering of off-screen content.
- **Don't assume animations inside stop** — paint is skipped but JS keeps running. phase loops self-pause off-screen on their own; gate raw rAF/interval work with `useRenderState`.
- **Don't mutate layout or unmount based on skip state** — that reintroduces the layout shift `contain-intrinsic-size` prevents.

## Does this affect layout or CLS?

No. `contain-intrinsic-size: auto <estimatedHeight>` reserves space before first paint, and the browser remembers the real size afterward. Content keeps its box whether painted or skipped, so nothing shifts on scroll. `Defer` defers rendering only — never layout reservation, DOM presence, or hydration.

## Reduced motion

Not applicable — `Defer` does not animate. It only toggles the browser's rendering of its subtree.

## See also

- [rendering-recipes](./rendering-recipes.md) — composing `Defer` with the other rendering helpers
- [when-visible](./when-visible.md) — gate mounting on viewport entry
- [when-idle](./when-idle.md) — gate mounting on browser idle
- [use-render-state](./use-render-state.md) — react to a `Defer` subtree's render-skip state

---

# Easing and math (`phase/ease`)

Pure functions. No browser APIs, no side effects, no React. Safe in server components, build scripts, Web Workers, and tests.

## Import

```ts
import { lerp, clamp01, easeOutCubic, remap } from 'phase/ease';
```

Tree-shakeable — unused functions are dead-code-eliminated.

## Easing functions

All take a progress value (0–1) and return a curved progress value (0–1). They don't know about time, pixels, or anything else — they reshape a number.

| Function                            | Character                                               |
| ----------------------------------- | ------------------------------------------------------- |
| `easeOutCubic(progress)`            | Fast start, smooth deceleration                         |
| `easeOutQuart(progress)`            | Sharper deceleration                                    |
| `easeOutBack(progress, overshoot?)` | Overshoots target, snaps back. Default overshoot ≈ 10%. |
| `easeInOutCubic(progress)`          | Symmetric S-curve                                       |
| `linear(progress)`                  | Identity — no easing                                    |

## Math utilities

| Function      | Signature                          | Description                          |
| ------------- | ---------------------------------- | ------------------------------------ |
| `clamp`       | `(value, min, max) → number`       | Constrain to range                   |
| `clamp01`     | `(value) → number`                 | Constrain to 0–1                     |
| `lerp`        | `(start, end, progress) → number`  | Linear interpolation                 |
| `inverseLerp` | `(start, end, value) → number`     | Where is value in range? Returns 0–1 |
| `remap`       | `(options: RemapOptions) → number` | Map from one range to another        |

### RemapOptions

```ts
interface RemapOptions {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  value: number;
}
```

## The canonical pattern

```ts
const progress = clamp01(elapsed / duration); // normalize time to 0–1
const eased = easeOutCubic(progress); // reshape the curve
const value = lerp(startPos, endPos, eased); // map to your range
```

Easing, interpolation, and your value range are three separate concerns. phase keeps them separate so you can mix and match.

## When to use

- Inside `onTick` / `draw` callbacks to compute animated values.
- In server-side code (e.g. generating animation keyframe data at build time).
- When `useTween` is too heavy or you need the raw math.
- Custom easing for `useTween`'s `easing` option.

## When NOT to use — reach for X instead

| Instead of this                                           | Use                                               |
| --------------------------------------------------------- | ------------------------------------------------- |
| Animating a value into React render                       | `useTween` — manages the loop for you             |
| CSS easing                                                | CSS `cubic-bezier()` or `linear()` — no JS needed |
| Complex easing (bounce, elastic with configurable params) | External library or hand-written math             |

## Do

- Use `clamp01` before easing to prevent out-of-range artifacts.
- Pass custom easing to `useTween`:
  ```tsx
  const value = useTween({ target: 100, easing: easeOutBack });
  ```
- Use `remap` to convert between coordinate spaces:
  ```ts
  const screenX = remap({
    inMin: 0,
    inMax: 1,
    outMin: -100,
    outMax: 100,
    value: progress,
  });
  ```

## Don't

- **Don't call `easeOutBack` with extremely large overshoot** — values > 5 can produce extreme over/undershoot. Default 1.70158 is intentional.
- **Don't allocate the `RemapOptions` object inside `onTick`** — pre-allocate and mutate the `value` field.
- **Don't use easing as a substitute for spring physics** — easing is time-based (fixed duration). Springs are velocity-aware (no fixed duration).

## Reduced motion

Easing functions are pure math — they don't know about reduced motion. The consumer of the eased value is responsible for checking motion preferences (or using a phase primitive that checks automatically).

## See also

- [useTween](./use-tween.md) — single-value animation using these easing functions
- [useLoop](./use-loop.md) — per-frame loop where you'd use lerp/clamp01/easing manually
- [decision-guide](./decision-guide.md) — when CSS easing is sufficient vs. JS

---

# `PhaseError` / `isPhaseError`

Every error includes a machine-readable `code` and an actionable message with `reason` and `fix` fields.

## Signature

```ts
import { PhaseError, isPhaseError } from 'phase';
import type { PhaseErrorCode } from 'phase';

// Check if an error is a PhaseError
if (isPhaseError(err)) {
  console.log(err.code, err.reason, err.fix);
}
```

### PhaseError properties

| Property  | Type                  | Description                       |
| --------- | --------------------- | --------------------------------- |
| `code`    | `PhaseErrorCode`      | Machine-readable error identifier |
| `reason`  | `string \| undefined` | Why the error occurred            |
| `fix`     | `string \| undefined` | How to resolve it                 |
| `message` | `string`              | Human-readable description        |

### Error codes

| Code               | Trigger                                       | Fix                                           |
| ------------------ | --------------------------------------------- | --------------------------------------------- |
| `server_context`   | Calling a browser-only primitive during SSR   | Move into `useEffect` or client-only module   |
| `no_element`       | Passing null/undefined `element`              | Pass a mounted Element, or use the React hook |
| `invalid_duration` | `useTween` duration is zero, negative, or NaN | Pass a positive number                        |
| `ticker_stopped`   | Calling `start`/`resume` on a stopped ticker  | Create a new ticker instance                  |
| `missing_context`  | `<Swap.State>` used outside `<Swap>`          | Wrap with `<Swap>`                            |

## When to use

- Catching phase-specific errors in try/catch and branching on `code`.
- Distinguishing phase errors from other errors in error boundaries.
- Logging structured error information (code + reason + fix).

## When NOT to use — reach for X instead

| Instead of this                         | Use                                                           |
| --------------------------------------- | ------------------------------------------------------------- |
| Preventing the error in the first place | Check the error code table above and avoid the trigger        |
| React error boundary                    | Standard React error boundary — `isPhaseError` helps classify |

## Do

- Use `isPhaseError(err)` for type-narrowing in catch blocks.
- Log `err.code` in telemetry for structured error tracking.
- Read `err.fix` for actionable guidance.

## Don't

- **Don't catch and silently swallow PhaseErrors** — they indicate misconfiguration, not transient failures.
- **Don't wrap `onTick` in try/catch** — defeats TurboFan optimization on the hot path.

## Reduced motion

Not applicable — errors are not affected by motion preferences.

## See also

- [create-loop](./create-loop.md) — throws `server_context`, `no_element`
- [create-ticker](./create-ticker.md) — throws `server_context`, `ticker_stopped`
- [use-tween](./use-tween.md) — throws `invalid_duration`
- [swap](./swap.md) — throws `missing_context`

---

# Performance rules

Impact-ranked do's and don'ts for writing performant animation code with phase. These are not aspirations — they are tested invariants backed by `src/__tests__/perf.spec.ts`.

## Contents

- **Critical** — Zero per-frame allocations | Never setState in onTick | No forced reflows
- **High** — Strong pause | Reduced motion by default | Stable function references
- **Medium** — Frame-locked shared clock | Delta clamping | Observer pooling | will-change lifecycle | No getBoundingClientRect for visibility
- **Low** — Don't store FrameState refs | No try/catch in onTick | No debug logging in hot path

## Critical (per-frame violations cause visible jank)

### Zero per-frame allocations

V8's garbage collector runs in stop-the-world bursts on the main thread. Every allocation inside `onTick` becomes GC pressure that directly causes dropped frames — even small objects accumulate across 60 calls/sec and trigger collections mid-animation. `FrameState` is created once and mutated in place every frame. Your `onTick`/`draw` must match.

**Do:**

```ts
// Pre-allocate outside the loop
const pos = { x: 0, y: 0 };

onTick: (frame) => {
  pos.x = Math.cos(frame.elapsed * 0.001) * radius;
  pos.y = Math.sin(frame.elapsed * 0.001) * radius;
  el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
};
```

**Don't:**

```ts
onTick: (frame) => {
  // EVERY ONE OF THESE ALLOCATES:
  const pos = { x: 0, y: 0 }; // object literal
  const points = [1, 2, 3]; // array literal
  const items = arr.map((x) => x * 2); // .map() returns new array
  const filtered = arr.filter((x) => x > 0); // .filter() returns new array
  const copy = { ...existing }; // spread operator
  const msg = `frame ${frame.frame}`; // template literal
  el.style.transform = fn(); // if fn() creates a closure
};
```

**Pragmatic exception:** writing a template literal to `el.style.transform` (as in the Do example above) is acceptable — you must produce a string to set a CSS property, and the browser immediately consumes it. The rule targets unnecessary intermediate allocations (objects, arrays, closures), not the unavoidable final string write to the DOM.

### Never `setState` inside `onTick` / `draw`

React's reconciler is designed for infrequent, batched updates — not 60Hz. Each `setState` schedules a full fiber tree walk, diffing, and DOM commit. At 60fps that's 60 reconciliations per second competing with your animation for the 16.6ms frame budget. The animation itself stalls while React diffs. Write to refs or DOM directly.

**Do:**

```ts
onTick: (frame) => {
  ref.current.style.opacity = String(clamp01(frame.elapsed / 1000));
};
```

**Don't:**

```ts
onTick: (frame) => {
  setOpacity(clamp01(frame.elapsed / 1000)); // 60 re-renders/sec
};
```

The only exception is `useTween`, which deliberately uses `setState` for single cheap renders.

### No forced reflows in animation paths

Layout-triggering APIs force the browser to synchronously compute layout before returning a value. Inside a 60fps loop, this means the browser performs a full style-recalc + layout pass _every single frame_ before your animation can proceed — the exact opposite of compositor-aligned animation. Never call these inside or near `onTick`:

- `getBoundingClientRect()`
- `offsetWidth`, `offsetHeight`, `offsetTop`, `offsetLeft`
- `scrollWidth`, `scrollHeight`, `scrollTop`, `scrollLeft`
- `getComputedStyle()`
- `clientWidth`, `clientHeight`

**Do:** Use `useSize` (ResizeObserver, async, compositor-aligned).

**Don't:**

```ts
onTick: () => {
  const rect = el.getBoundingClientRect(); // FORCES SYNCHRONOUS LAYOUT
  el.style.transform = `translateX(${rect.width}px)`;
};
```

## High (lifecycle violations waste CPU or break guarantees)

### Strong pause

The weak-pause pattern (schedule rAF + early return) still costs ~0.1ms per frame in scheduling overhead, and on mobile that accumulates across multiple paused loops sharing the thread — draining battery for zero visual output. phase uses `cancelAnimationFrame()` to stop scheduling entirely when paused. Zero callbacks fire, zero CPU consumed.

**Don't replicate phase's pattern incorrectly:**

```ts
// WEAK PAUSE — still schedules rAF, still fires callback, just returns early
function tick() {
  requestAnimationFrame(tick);
  if (paused) return; // CPU wasted on scheduling + callback invocation
  draw();
}
```

**Do:** Let phase manage the loop, or call `ticker.pause()` / `ticker.resume()`.

### Reduced motion by default

All phase primitives respect `prefers-reduced-motion: reduce` automatically. Bypassing requires explicit `reducedMotion: 'ignore'`.

**Don't:**

```ts
// Ignoring reduced motion without justification
createLoop({ element: el, onTick: draw, reducedMotion: 'ignore' });
```

**Do:** Only use `'ignore'` for non-decorative motion (data visualization that communicates via movement, a game, an accessibility feature that uses motion).

### Stable function references

Per-frame callbacks should be created once, not recreated every render.

**Don't:**

```tsx
// Creates a new function every render — unnecessary (phase syncs via ref)
return <Anim onTick={(frame) => draw(frame, props)} />;
```

**Do:** Trust that `useLoop`/`useCanvas` syncs `onTick`/`draw` via `useSyncedRef` internally. The latest closure is always called without restarting the loop.

## Medium (performance degradation under load)

### Frame-locked shared clock

All tickers share one `requestAnimationFrame` loop with a single `performance.now()` read per frame.

**Don't:**

```ts
// Multiple independent rAF loops = different timestamps = visual desync
requestAnimationFrame(function loop1() {
  /* ... */ requestAnimationFrame(loop1);
});
requestAnimationFrame(function loop2() {
  /* ... */ requestAnimationFrame(loop2);
});
```

**Do:** Use multiple `createTicker` / `useLoop` instances — they automatically share the clock.

### Delta clamping

`frame.delta` is clamped to 40ms. When resuming from a long pause (tab switch, debugger), animations pick up smoothly instead of teleporting.

**Don't:**

```ts
onTick: (frame) => {
  // Using raw time difference instead of frame.delta
  const dt = performance.now() - lastTime; // can be 10000ms after tab switch
  position += velocity * dt; // TELEPORT
};
```

**Do:** Use `frame.delta` and `frame.elapsed` — both account for pause time and clamping.

### Observer pooling

phase pools IntersectionObserver (keyed by serialized options), ResizeObserver (singleton), and MediaQueryList (keyed by query string).

**Don't:**

```ts
// Creating raw observers outside the pool
const io = new IntersectionObserver(callback, options);
io.observe(element);
```

**Do:** Use `createSight`, `createScrollProgress`, `useSize`, `useMediaQuery` — all use the shared pools automatically. 20 elements with the same IO options share one observer instance.

### `will-change` only while animating

`will-change` promotes an element to its own GPU compositing layer — consuming VRAM and preventing the browser from coalescing paint operations. Leaving it on permanently wastes GPU memory when the animation is paused or idle.

**Don't:**

```tsx
// Permanent GPU layer even when animation is paused or never visible
<div className="will-change-transform" />
```

**Do:** Toggle `will-change` based on animation state:

```tsx
<div className={shouldAnimate ? 'will-change-transform' : ''} />
```

For JS-driven animations via `useLoop`, the browser auto-promotes after the first few `style.transform` writes — you typically don't need `will-change` at all. It's primarily useful for CSS `animation` / `transition` where you want to signal the compositor before the animation starts.

### Don't use `getBoundingClientRect()` for initial visibility

A common temptation: "the hero is above the fold, I want animation to start immediately without waiting for IntersectionObserver." The IO callback fires at paint time — one frame (~16ms). For animations with multi-second intervals, that delay is imperceptible. The reflow cost of `getBoundingClientRect()` is real, especially on pages with complex layout.

**Don't:**

```ts
const rect = element.getBoundingClientRect();
const initiallyInView = rect.top < window.innerHeight && rect.bottom > 0;
```

**Do:** Trust IntersectionObserver. The one-frame delay is invisible to users. Use `rootMargin` to trigger slightly early if needed:

```ts
const observer = new IntersectionObserver(callback, { rootMargin: '50px' });
```

Or use `useSight` / `useLifecycle` which handle this correctly via the pooled IO.

## Low (correctness, not perf)

### Don't store FrameState references

`FrameState` is the same object every tick, mutated in place. Reading it asynchronously gives stale data.

**Don't:**

```ts
let savedFrame: FrameState;
onTick: (frame) => {
  savedFrame = frame; // Points to the same mutating object
};
setTimeout(() => console.log(savedFrame.elapsed), 1000); // Stale
```

**Do:** Copy the values you need immediately:

```ts
let lastElapsed = 0;
onTick: (frame) => {
  lastElapsed = frame.elapsed; // Copy the primitive value
};
```

### No try/catch wrapping onTick

Wrapping the hot path in try/catch defeats TurboFan optimization in V8.

**Don't:**

```ts
onTick: (frame) => {
  try {
    draw(frame); // V8 won't optimize this function
  } catch (e) {
    handleError(e);
  }
};
```

**Do:** Let errors propagate naturally. Handle them at the component level (error boundary).

### No debug logging in hot path

String operations (template literals, `.toString()`, `JSON.stringify`) allocate. Console methods have side effects.

**Don't:**

```ts
onTick: (frame) => {
  console.log(`Frame ${frame.frame}: elapsed=${frame.elapsed}`); // allocates + I/O
  draw(frame);
};
```

**Do:** Use conditional logging gated by a devtools flag, or log outside the hot path (e.g. in `onPhaseChange`).

---

# `prefersReducedMotion`

Returns `true` when the user has enabled reduced motion at the OS level. Use to gate expensive setup or dynamic imports.

## Signature

```ts
import { prefersReducedMotion } from 'phase';

const reduced: boolean = prefersReducedMotion();
```

No options. Returns `false` on the server (no `matchMedia`).

## When to use

- Gating expensive setup that shouldn't happen under reduced motion:
  ```ts
  if (!prefersReducedMotion()) {
    const { startParticles } = await import('./particles');
    startParticles(canvas);
  }
  ```
- Conditionally importing heavy animation modules.
- Making decisions at app initialization time before any hooks run.

## When NOT to use — reach for X instead

| Instead of this                            | Use                                                             |
| ------------------------------------------ | --------------------------------------------------------------- |
| Reactive subscription to motion preference | `useMediaQuery('(prefers-reduced-motion: reduce)')`             |
| Gating an animation loop                   | `createLoop` / `useLoop` — handles reduced motion automatically |
| Checking inside a React component          | The hooks handle it for you — no manual check needed            |

## Do

- Use for conditional `import()` of heavy animation code.
- Use at module/app init level, outside React's render cycle.
- Trust that all phase hooks/primitives consult this signal automatically — you rarely need this directly.

## Don't

- **Don't poll it in a loop** — it reads from the shared MQL pool (cheap), but still don't call it per-frame.
- **Don't use it to skip reduced motion handling** — that's what `reducedMotion: 'ignore'` is for on the primitive options.
- **Don't assume it's reactive** — this is a point-in-time read. For reactivity, use `useMediaQuery`.

## Reduced motion

This IS the reduced motion primitive. All other phase exports delegate to it internally.

## See also

- [use-media-query](./use-media-query.md) — reactive subscription (re-renders on change)
- [create-loop](./create-loop.md) — automatic reduced-motion handling via `reducedMotion` option
- [create-lifecycle](./create-lifecycle.md) — automatic reduced-motion handling

---

# `Presence`

Renders a `div` that manages its own mount/unmount lifecycle, stamping `data-phase` for exit and `data-enter="animate"` for enter.

## Signature

```tsx
import { Presence } from 'phase/react';

<Presence show={isOpen} className="...">
  content
</Presence>;
```

### Props

| Prop            | Type                     | Default     | Description                       |
| --------------- | ------------------------ | ----------- | --------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                 |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount animation behavior    |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)      |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion handling           |
| `ref`           | `Ref<HTMLDivElement>`    | —           | Forward a ref to the wrapper div  |
| ...rest         | `ComponentProps<'div'>`  | —           | All standard div props            |

### Data attributes stamped

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Visible                                                        |
| `data-phase="exiting"` | Exit animation in progress                                     |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Simple show/hide transitions where a wrapper `div` is acceptable.
- Modals, toasts, menus, dropdowns — anything that mounts/unmounts.
- You want zero boilerplate (compared to `usePresence`).

## When NOT to use — reach for X instead

| Instead of this               | Use                                           |
| ----------------------------- | --------------------------------------------- |
| Need custom element (not div) | `usePresence` hook — full control over markup |
| Exit→enter between N states   | `<Swap>` — coordinated transitions            |
| Viewport-gated lazy mount     | `<WhenVisible>`                               |
| Per-frame animation           | `useLoop`                                     |

## Do

- Use the canonical CSS pattern:
  ```tsx
  <Presence
    show={isOpen}
    className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
  >
    Modal content
  </Presence>
  ```
- Use `mode: 'reveal'` for SEO content (stays in DOM, hidden via data-phase).
- Use `enter: 'instant'` to skip enter animation on first mount (e.g. initially visible content).

## Don't

- **Don't use for per-frame animation** — `Presence` is for mount/unmount transitions only.
- **Don't set `exitDuration` shorter than your CSS transition** — causes mid-animation unmount.
- **Don't nest `<Presence>` inside another `<Presence>` for exit→enter** — use `<Swap>` instead.

## Reduced motion

Default `'respect'`: enter animation skipped (`data-enter="animate"` not stamped), exit is instant (no `exiting` phase). Element still appears/disappears — decoration is removed, not behavior.

## See also

- [usePresence](./use-presence.md) — hook for full control over markup
- [swap](./swap.md) — coordinated exit→enter
- [when-visible](./when-visible.md) — viewport-gated lazy mount

---

# Rendering recipes

How to compose `Defer`, `WhenVisible`, `WhenIdle`, `useIdle`, `useWhenIdle`, and `useRenderState` with each other, with `next/dynamic`, and with the rest of phase. Each recipe is a scenario, a minimal pattern, and when to reach for it.

For the single-helper decision (which one at all), see [decision-guide.md](./decision-guide.md). This file is about combining them.

> **Reserve space in the fallback (for `WhenVisible` / `WhenIdle`).** Their children are absent from the DOM until they mount, so a zero-height or mismatched `fallback` (or `loading` placeholder) shifts everything below the moment the real content appears. Render the fallback at the final content's height — a sized skeleton or fixed-height box. This is the most common way these two helpers introduce a loading problem, and every recipe below follows it.
>
> **`Defer` is different — no hard layout shift.** Its children stay in the DOM and the browser measures and paints them at their true size when they scroll in, so a wrong `estimatedHeight` does **not** shift content. It only affects scrollbar proportion and scroll-anchoring math until first render. Give a realistic estimate to keep the scrollbar steady, but an imperfect one is cosmetic, not a CLS bug.

## Choosing between `Defer`, `WhenVisible`, and `WhenIdle`

When more than one could work, decide in this order:

1. **Must the content be in the server HTML?** (SEO, deep links, no-JS) → `Defer`. It is the only one that keeps children server-rendered.
2. **Is the mount itself expensive?** (large subtree, heavy component) → `WhenVisible` (scroll-gated) or `WhenIdle` (idle-gated). `Defer` still mounts and hydrates — it only skips paint.
3. **Trigger: scroll or idle?** Near-viewport relevance → `WhenVisible`. Non-critical, "whenever there's spare time" → `WhenIdle`.

> `Defer` skips paint but still mounts and hydrates. `When*` skip the mount entirely but drop the content from SSR HTML. Pick by what you can afford to lose.

### phase helpers vs `next/dynamic`

They solve different halves of the problem and compose:

- **`next/dynamic` (or React `lazy()`) splits the _bundle_** — the component's JS lands in a separate chunk and can skip SSR (`ssr: false`). But the chunk still downloads as soon as the component mounts.
- **`WhenVisible` / `WhenIdle` gate the _mount_** — nothing renders (and, with `lazy()`/`dynamic` inside, nothing downloads) until the element nears the viewport or the browser is idle.

Use `next/dynamic` alone when the component is below the fold but will almost certainly be needed (split the bytes, mount normally). Wrap it in `WhenVisible`/`WhenIdle` when you also want to defer the _download_ until the user is likely to need it. In Next.js apps, prefer `next/dynamic` over `lazy()` — it integrates with SSR and the loader.

## Recipe: two-tier — `Defer` outside, `WhenVisible` inside

**Scenario:** a long page of sections, most cheap, a few with a heavy interactive island.

```tsx
<Defer estimatedHeight="80vh">
  <section>
    <Prose />
    <WhenVisible rootMargin="200px">
      <HeavyChart />
    </WhenVisible>
  </section>
</Defer>
```

**Why/when:** `Defer` cheaply skips paint/layout for the whole off-screen section (and keeps the prose crawlable), while `WhenVisible` avoids mounting the genuinely expensive island until it is near the viewport. Use when a section is mostly static content with one heavy widget.

## Recipe: `WhenVisible` + `next/dynamic` (defer the download)

**Scenario:** a heavy, below-the-fold widget in a Next.js app — defer both its bytes and its download until the user scrolls near it.

```tsx
const HeavyChart = dynamic(
  () => import('./heavy-chart').then((m) => m.HeavyChart),
  { ssr: false, loading: () => <div className="h-[400px]" /> },
);

<WhenVisible rootMargin="200px" fallback={<div className="h-[400px]" />}>
  <HeavyChart />
</WhenVisible>;
```

**Why/when:** `next/dynamic` splits the chunk; `WhenVisible` holds the mount (and therefore the chunk download) until the element nears the viewport. Both the `loading` placeholder and the `fallback` reserve the final `400px` height, so nothing shifts. Use `next/dynamic` alone if the widget will almost certainly be seen; add `WhenVisible` to also delay the download for content many users never reach.

## Recipe: `WhenIdle` + `next/dynamic` (non-critical, idle-loaded)

**Scenario:** a non-critical, code-split widget that should load when the main thread is free — not gated on scroll.

```tsx
const Secondary = dynamic(
  () => import('./secondary-panel').then((m) => m.SecondaryPanel),
  { ssr: false, loading: () => <Skeleton className="h-[320px]" /> },
);

<WhenIdle fallback={<Skeleton className="h-[320px]" />}>
  <Secondary />
</WhenIdle>;
```

**Why/when:** `WhenIdle` defers the mount past first paint; `next/dynamic` keeps the code out of the initial bundle. Both placeholders reserve the same `320px` height to avoid layout shift. Use for supplementary UI (activity feeds, recommendations) that is not SEO-critical. For viewport relevance instead of idle, swap `WhenIdle` for `WhenVisible`. (Outside Next.js, use React `lazy()` + `Suspense` in place of `next/dynamic`.)

## Recipe: `useIdle` to sequence work

**Scenario:** render critical UI immediately, then attach non-critical work once idle.

```tsx
function Dashboard() {
  const idle = useIdle();
  return (
    <>
      <PrimaryMetrics />
      {idle ? <BackgroundCharts /> : null}
    </>
  );
}
```

**Why/when:** `useIdle` is the boolean form — reach for it to gate part of a _render_ inline. Prefer `WhenIdle` when wrapping children, `useIdle` for an inline boolean, and `useWhenIdle` for a _side effect_ (next recipe).

## Recipe: prefetch a heavy chunk on idle with `useWhenIdle`

**Scenario:** a panel or route the user will likely open soon — warm its code-split chunk during idle so it opens instantly, without blocking first paint.

```tsx
const openPanel = () => import('./chat-panel-with-chat');
const ChatPanel = lazy(openPanel);

function Chat() {
  useWhenIdle(() => void openPanel()); // prefetch the chunk when idle
  return open ? (
    <Suspense fallback={<Skeleton className="h-[480px]" />}>
      <ChatPanel />
    </Suspense>
  ) : null;
}
```

**Why/when:** `useWhenIdle` is the effect-shaped idle primitive — it runs a callback once, cancels on unmount, and always calls the latest closure. Use it for prefetch, cache warming, or any non-urgent `import()`. It replaces the common (and frequently leaky) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])` — `useWhenIdle` handles the cancel and the SSR guard for you. Reach for `useIdle` instead when you need to _render_ from the idle signal rather than run a side effect.

## Recipe: render helper around a phase loop

**Scenario:** a `useLoop`/`useCanvas` animation that lives below the fold.

```tsx
<WhenVisible rootMargin="200px">
  <ParticleCanvas /> {/* uses useCanvas internally */}
</WhenVisible>
```

**Why/when:** safe and recommended. phase loops self-pause off-screen via their own `createSight`, so wrapping them is purely about deferring the _mount_ cost, not pausing the loop. You do not need `useRenderState` here — the loop already stops when unseen.

## Recipe: `Defer` + `useRenderState` for raw loops

**Scenario:** a hand-written `requestAnimationFrame` loop or `setInterval` inside deferred content.

```tsx
function Raw() {
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
}
```

**Why/when:** `content-visibility: auto` skips paint, not JavaScript — raw loops keep burning CPU inside a `Defer`. `useRenderState` reports the browser's actual render-skip decision so you can pause them. You only need this for non-phase work; phase loops already self-pause. `useRenderState` only listens — it never mutates layout, so the no-layout-shift guarantee holds.

## What not to compose

- **Don't wrap a `Defer` in a `WhenVisible`** — redundant. `WhenVisible` already withholds the mount until near the viewport, so the `content-visibility` skip never applies. Pick one tier.
- **Don't reach for `useRenderState` around a phase loop** — `useLoop`/`useCanvas`/`useLifecycle` self-pause off-screen already. Adding it is dead weight.
- **Don't use `WhenIdle`/`WhenVisible` for SEO-critical content** — their children are absent from SSR HTML. Use `Defer`.
- **Don't ship a zero-height or mismatched fallback** — gating the mount only helps if the placeholder reserves the final size; otherwise you trade a render cost for a layout shift.

## See also

- [decision-guide.md](./decision-guide.md) — choosing a tier and the single-helper decision
- [defer.md](./defer.md) — `content-visibility` wrapper
- [when-idle.md](./when-idle.md) — idle-gated mount + `whenIdle`
- [when-visible.md](./when-visible.md) — viewport-gated mount
- [use-render-state.md](./use-render-state.md) — render-skip signal for raw work

---

# `Swap`

Coordinated exit-then-enter transitions for N states. The current state fully exits before the new state enters (no overlap, no z-index issues).

## Signature

```tsx
import { Swap } from 'phase/react';

<Swap active={currentId}>
  <Swap.State id="a" className="...">
    Content A
  </Swap.State>
  <Swap.State id="b" className="...">
    Content B
  </Swap.State>
</Swap>;
```

### Swap props

| Prop           | Type                    | Default  | Description                           |
| -------------- | ----------------------- | -------- | ------------------------------------- |
| `active`       | `string`                | required | ID of the currently active state      |
| `exitDuration` | `number`                | `5000`   | Safety timeout for exit (ms)          |
| ...rest        | `ComponentProps<'div'>` | —        | All standard div props on the wrapper |

### Swap.State props

| Prop    | Type                    | Default  | Description             |
| ------- | ----------------------- | -------- | ----------------------- |
| `id`    | `string`                | required | Unique state identifier |
| `ref`   | `Ref<HTMLDivElement>`   | —        | Forward a ref           |
| ...rest | `ComponentProps<'div'>` | —        | All standard div props  |

### Behavior

- First state appears instantly (CLS prevention — no enter animation on initial mount).
- Subsequent states animate via `@starting-style` after the previous state exits.
- Rapid changes (A→B→C during A's exit) skip intermediates and advance to the latest `active`.
- `<Swap.State>` outside `<Swap>` throws `PhaseError` with code `missing_context`.

## When to use

- Form→success transitions, step wizards, tab content switching.
- Anywhere you need coordinated exit→enter without overlap.
- When both old and new content should animate (exit old, then enter new).

## When NOT to use — reach for X instead

| Instead of this                 | Use                                |
| ------------------------------- | ---------------------------------- |
| Simple show/hide (one thing)    | `<Presence>`                       |
| Overlap transitions (crossfade) | Manual dual `<Presence>` + z-index |
| Route-level page transitions    | View Transitions API               |

## Do

- Use the canonical CSS pattern:
  ```tsx
  <Swap active={success ? 'success' : 'form'}>
    <Swap.State
      id="form"
      className="transition-all data-[phase=exiting]:opacity-0"
    >
      <Form />
    </Swap.State>
    <Swap.State
      id="success"
      className="transition-all data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
    >
      <SuccessMessage />
    </Swap.State>
  </Swap>
  ```
- Ensure every `<Swap.State>` has a unique `id`.

## Don't

- **Don't use `<Swap.State>` outside `<Swap>`** — throws `PhaseError` with code `missing_context`.
- **Don't expect overlap** — `Swap` is sequential (exit completes, then enter starts). For crossfade, use two `<Presence>` components.
- **Don't change `id` values dynamically** — IDs are stable identifiers for states.

## Reduced motion

Automatic: enter animation skipped for the incoming state, exit is instant for the outgoing state. Both still swap — decoration is removed, not behavior.

## See also

- [presence](./presence.md) — simple show/hide without coordination
- [usePresence](./use-presence.md) — hook for custom presence logic
- [when-visible](./when-visible.md) — viewport-gated (different concern)

---

# `useCanvas`

Everything `useLoop` provides, plus DPR-aware buffer sizing, ResizeObserver coalescing, and GPU context loss recovery.

## Signature

```ts
import { useCanvas } from 'phase/react';

const { restart, phase, phaseReason, quality, qualityReason } =
  useCanvas(options);
```

### Options

| Option          | Type                                                                     | Default      | Description                                  |
| --------------- | ------------------------------------------------------------------------ | ------------ | -------------------------------------------- |
| `containerRef`  | `RefObject<Element \| null>`                                             | required     | Element that determines canvas size          |
| `canvasRef`     | `RefObject<HTMLCanvasElement \| null>`                                   | required     | The `<canvas>` element                       |
| `draw`          | `(ctx: CanvasRenderingContext2D, frame: FrameState, size: Size) => void` | required     | Called every frame                           |
| `fps`           | `number`                                                                 | —            | Cap frames per second                        |
| `enabled`       | `boolean`                                                                | `true`       | When `false`, tears down everything          |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'`                                      | `'pause'`    | Behavior under reduced motion                |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'`                                      | `'throttle'` | For heavy GPU work, `'pause'` is often right |
| `degradedFps`   | `number`                                                                 | `30`         | FPS cap in degraded throttle mode            |

### Return

| Property        | Type                          | Description                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| `restart`       | `() => void`                  | Tear down and rebuild (e.g. after config change) |
| `phase`         | `LoopPhase`                   | Current loop phase                               |
| `phaseReason`   | `LoopReason`                  | Why                                              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                           |
| `qualityReason` | `DegradedReason \| undefined` | Why quality degraded                             |

## When to use

- 2D canvas animations (particles, data viz, generative art).
- You need DPR-aware sizing (retina displays, multi-monitor drag).
- You want GPU context loss handled automatically (mobile tab eviction).
- Container-driven sizing (canvas fills its parent, not the viewport).

## When NOT to use — reach for X instead

| Instead of this                        | Use                                     |
| -------------------------------------- | --------------------------------------- |
| DOM transforms (not canvas)            | `useLoop` — simpler, no canvas concerns |
| WebGL via three.js/Pixi (own renderer) | `useLifecycle` + your renderer's loop   |
| Static canvas (draw once)              | One-shot `useEffect` with canvas API    |

## Do

- Cleanup is automatic — the effect teardown stops the loop, unobserves resize, and removes context-loss listeners on unmount.
- Pass two refs (container + canvas):
  ```tsx
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  useCanvas({ containerRef, canvasRef, draw });
  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
  ```
- Draw in CSS pixels — `ctx` is already scaled for `devicePixelRatio`.
- Use `degraded: 'pause'` for heavy GPU work that can't gracefully degrade.
- Read `quality` to adapt rendering (fewer particles, simpler shaders).

## Don't

- **Never call `setState` inside `draw`** — same rule as `onTick`.
- **Never allocate inside `draw`** — zero-allocation contract applies.
- **Don't call `canvas.getContext('2d')` yourself** — `useCanvas` manages the context.
- **Don't manually set `canvas.width`/`canvas.height`** — handled by the resize system.
- **Don't use `getBoundingClientRect()` for sizing** — uses ResizeObserver (async, no reflow).

## Reduced motion

Default `'pause'`: canvas stops rendering. Consider `'pause'` over `'complete'` for canvas since there's no single "end state" to jump to.

## See also

- [useLoop](./use-loop.md) — DOM animation variant (no canvas concerns)
- [useLifecycle](./use-lifecycle.md) — use with three.js/Pixi where you own the renderer
- [createLoop](./create-loop.md) — framework-agnostic core

---

# `useContainerQuery`

Returns whether an element matches a size-based container breakpoint. Re-renders only when the match result flips.

## Signature

```ts
import { useContainerQuery } from 'phase/react';

const { ref, matches } = useContainerQuery<T>(breakpoint, options?);
```

### Breakpoint (first arg)

| Property    | Type     | Description             |
| ----------- | -------- | ----------------------- |
| `minWidth`  | `number` | Minimum width to match  |
| `maxWidth`  | `number` | Maximum width to match  |
| `minHeight` | `number` | Minimum height to match |
| `maxHeight` | `number` | Maximum height to match |

### Options (second arg)

| Option | Type                   | Default  | Description        |
| ------ | ---------------------- | -------- | ------------------ |
| `ref`  | `RefObject<T \| null>` | returned | Bring your own ref |

### Return

| Property  | Type                   | Description                           |
| --------- | ---------------------- | ------------------------------------- |
| `ref`     | `RefObject<T \| null>` | Attach to the measured element        |
| `matches` | `boolean`              | Whether the element currently matches |

## When to use

- Component-level responsive design (independent of viewport).
- Showing/hiding content based on container width.
- Adapting layout at specific size boundaries.

## When NOT to use — reach for X instead

| Instead of this                           | Use                             |
| ----------------------------------------- | ------------------------------- |
| Need actual dimensions (not just boolean) | `useSize`                       |
| Viewport-based media query                | `useMediaQuery`                 |
| CSS container queries are sufficient      | CSS `@container` — no JS needed |

## Do

- Use for responsive component behavior:
  ```tsx
  const { ref, matches: isWide } = useContainerQuery({ minWidth: 600 });
  return <div ref={ref}>{isWide ? <WideLayout /> : <NarrowLayout />}</div>;
  ```
- Combine multiple breakpoints by calling `useContainerQuery` multiple times.

## Don't

- **Don't use when CSS `@container` queries can do the job** — pure CSS is cheaper.
- **Don't set contradictory min/max values** — `matches` will always be `false`.

## Reduced motion

Not applicable — reports a boolean, not animation.

## See also

- [useSize](./use-size.md) — raw dimensions (re-renders on every change)
- [useMediaQuery](./use-media-query.md) — viewport/device media queries

---

# `useIdle`

Returns `false`, then `true` once the browser is idle after mount. The boolean hook behind `WhenIdle`. Use it to defer non-critical work or conditional rendering until the main thread is free.

## Signature

```ts
import { useIdle } from 'phase/react';

const idle = useIdle({ timeout: 2000 });
```

### Options

| Option    | Type     | Default | Description                              |
| --------- | -------- | ------- | ---------------------------------------- |
| `timeout` | `number` | —       | Max ms to wait before flipping to `true` |

## When to use

- Conditionally render non-critical UI after the page settles.
- Kick off deferrable side effects (prefetch, analytics init) once idle.
- You need the boolean directly rather than the `WhenIdle` mounting wrapper.

## When NOT to use — reach for X instead

| Instead of this                 | Use                         |
| ------------------------------- | --------------------------- |
| Mounting a subtree when idle    | `WhenIdle`                  |
| Running a one-off idle callback | `whenIdle` (no React state) |
| Gating on viewport visibility   | `useSight` / `WhenVisible`  |

## Do

- **Gate non-critical rendering:**
  ```tsx
  const idle = useIdle();
  return idle ? <Analytics /> : null;
  ```

## Don't

- **Don't use for SSR-critical content** — returns `false` on the server and the first client render, so idle-gated content is absent from server HTML.
- **Don't drive per-frame work off it** — it flips once and stays `true`; it is not a loop.

## Reduced motion

Not applicable — `useIdle` is a scheduling signal, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [rendering-recipes](./rendering-recipes.md) — sequencing work with `useIdle` and composing the rendering helpers
- [use-when-idle](./use-when-idle.md) — the effect form, for side effects (prefetch, `import()`) once idle
- [when-idle](./when-idle.md) — the mounting wrapper around `useIdle`
- [use-sight](./use-sight.md) — visibility-based gating instead of idle

---

# `useLifecycle`

The activation signal for loops you own. Wraps `createLifecycle` — returns `active` / `paused` so a consumer-owned render loop can pause when off-screen or under reduced motion.

## Signature

```ts
import { useLifecycle } from 'phase/react';

const { ref, phase, phaseReason, isActive } = useLifecycle<T>(options?);
```

### Options

| Option                | Type                       | Default   | Description                                 |
| --------------------- | -------------------------- | --------- | ------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`     | returned  | Bring your own ref                          |
| `reducedMotion`       | `'pause' \| 'ignore'`      | `'pause'` | Whether reduced motion pauses the lifecycle |
| `paused`              | `boolean`                  | `false`   | Manual pause (e.g. panel covers animation)  |
| `enabled`             | `boolean`                  | `true`    | When `false`, tears down and reports `idle` |
| `intersectionOptions` | `IntersectionObserverInit` | —         | Forwarded to IO                             |

### Return

| Property      | Type                   | Description                                                                                    |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `ref`         | `RefObject<T \| null>` | Attach to the element whose visibility gates your loop                                         |
| `phase`       | `LifecyclePhase`       | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason`      | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |
| `isActive`    | `boolean`              | Convenience: `phase === 'active'`                                                              |

## When to use

- You own the render loop (three.js, Pixi, WebGL, a Web Worker) but want phase's lifecycle guarantees.
- You need `paused` prop support for UI-driven suspension.
- You want a single `isActive` boolean to gate your `useEffect`-based loop.

## When NOT to use — reach for X instead

| Instead of this                            | Use                      |
| ------------------------------------------ | ------------------------ |
| You want phase to drive the loop           | `useLoop` or `useCanvas` |
| Just need visibility (no animation gating) | `useSight`               |
| Framework-agnostic code                    | `createLifecycle`        |

## Do

- Cleanup is automatic — the effect teardown calls `stop()` on unmount. No manual cleanup needed.
- Gate your renderer with `isActive`:
  ```tsx
  const { ref, isActive } = useLifecycle();
  useEffect(() => {
    if (!isActive) return;
    let raf = requestAnimationFrame(function render() {
      renderer.render();
      raf = requestAnimationFrame(render);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);
  return <canvas ref={ref} />;
  ```
- Use `paused` for contextual suspension (modal, settings panel).

- Use as a thin RSC boundary for CSS animations with server-rendered content. Wrap `useLifecycle` in a named client component — the naming IS the documentation:

  ```tsx
  'use client';
  export function LogoAnimationGate({ children }: { children: ReactNode }) {
    const { ref, isActive } = useLifecycle({
      intersectionOptions: { rootMargin: '50px', threshold: 0.5 },
    });

    return (
      <div
        ref={ref}
        data-active={isActive || undefined}
        className={
          isActive
            ? 'will-change-transform [animation-play-state:running]'
            : '[animation-play-state:paused]'
        }
      >
        {children}
      </div>
    );
  }
  ```

  Name the wrapper for your context (`LogoAnimationGate`, `CarouselAnimationGate`). Server-rendered children pass through without hydration.

## Don't

- **Don't use `useLifecycle` when `useLoop` would work** — if phase can drive the loop, let it (you get quality signals, frame budget tracking, and shared clock for free).
- **Don't set `paused` to implement visibility pausing** — that's automatic. Manual pause is for UI scenarios only.
- **Don't ship a generic `<Lifecycle>` component** — unlike `Presence` (which has real transitionend/timeout logic), the lifecycle wrapper is 4 lines. Name it contextually and own those lines.

## Reduced motion

Default `'pause'`: `isActive` becomes `false`, `phaseReason` is `'reduced-motion'`. Your renderer should stop entirely. With `'ignore'`: lifecycle stays active regardless.

## See also

- [useLoop](./use-loop.md) — use when phase should drive the loop
- [useCanvas](./use-canvas.md) — use for canvas where phase drives the loop
- [useSight](./use-sight.md) — pure visibility, no animation gating
- [createLifecycle](./create-lifecycle.md) — framework-agnostic core

---

# `useLoop`

The primary React hook. Wraps `createLoop` with React lifecycle management — visibility-aware animation loop that never triggers re-renders from the frame loop.

## Signature

```ts
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason, quality, qualityReason } = useLoop<T>(options);
```

### Options

| Option                | Type                                | Default      | Description                                        |
| --------------------- | ----------------------------------- | ------------ | -------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`              | returned     | Bring your own ref, or attach the returned one     |
| `onTick`              | `(frame: FrameState) => void`       | required     | Called every frame — write to refs/DOM only        |
| `fps`                 | `number`                            | —            | Cap frames per second                              |
| `enabled`             | `boolean`                           | `true`       | When `false`, tears down the loop (reports `idle`) |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior under reduced motion                      |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades                     |
| `degradedFps`         | `number`                            | `30`         | FPS cap in degraded throttle mode                  |
| `intersectionOptions` | `IntersectionObserverInit`          | —            | Forwarded to IO                                    |

### Return

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `ref`           | `RefObject<T \| null>`        | Attach to the animated element                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- Animating DOM elements in a per-frame loop (transforms, positions, colors).
- You need visibility-aware pausing (zero CPU off-screen).
- You want phase/quality signals exposed as React state for conditional rendering.

## When NOT to use — reach for X instead

| Instead of this                       | Use                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
| Canvas/WebGL animation                | `useCanvas` — adds DPR handling, resize, context loss recovery |
| You own the renderer (three.js, Pixi) | `useLifecycle` — gives active/paused signal                    |
| Single numeric value into render      | `useTween`                                                     |
| No React                              | `createLoop` (core)                                            |

## Do

- Cleanup is automatic — the effect teardown calls `stop()` on unmount. No manual cleanup needed.
- Attach the returned `ref` to the element you're animating:
  ```tsx
  const { ref } = useLoop({
    onTick: (frame) => {
      ref.current.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
    },
  });
  return <div ref={ref} />;
  ```
- Use `enabled` to conditionally tear down and restart the loop:
  ```tsx
  useLoop({ onTick: draw, enabled: isAnimating });
  ```
- Your `onTick` always sees the latest props/state/refs without restarting the loop (stored via `useSyncedRef` internally).

## Don't

- **Never call `setState` inside `onTick`** — triggers 60 re-renders/sec. Write to refs or DOM.
- **Never allocate inside `onTick`** — no objects, arrays, closures, or spreads. Template literals for the final `style.*` write are acceptable (see [performance.md](./performance.md)).
- **Never store a reference to `frame`** — same object mutated in place each tick.

## Reduced motion

Default `'pause'`: loop pauses, `phaseReason` is `'reduced-motion'`. Use `'complete'` for tweens that should jump to target. Use `'ignore'` only for non-decorative motion.

## See also

- [useCanvas](./use-canvas.md) — canvas/WebGL variant with DPR and resize handling
- [useLifecycle](./use-lifecycle.md) — activation signal for loops you own
- [createLoop](./create-loop.md) — framework-agnostic core
- [useTween](./use-tween.md) — single-value animation into React state

---

# `useMediaQuery`

CSS media query subscription via the shared MQL pool. Returns `false` during SSR and initial hydration, then the live value.

## Signature

```ts
import { useMediaQuery } from 'phase/react';

const matches: boolean = useMediaQuery(query);
```

### Parameters

| Parameter | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `query`   | `string` | CSS media query string (e.g. `'(max-width: 600px)'`) |

### Return

`boolean` — whether the media query currently matches.

## When to use

- Subscribing to viewport-level or device-level media queries reactively.
- Dark mode detection: `useMediaQuery('(prefers-color-scheme: dark)')`.
- Reduced motion detection (reactive): `useMediaQuery('(prefers-reduced-motion: reduce)')`.
- Responsive logic that depends on viewport, not element size.

## When NOT to use — reach for X instead

| Instead of this                     | Use                                                  |
| ----------------------------------- | ---------------------------------------------------- |
| Element-level breakpoint            | `useContainerQuery` or `useSize`                     |
| One-shot reduced motion check       | `prefersReducedMotion()` (synchronous, non-reactive) |
| Animation gating for reduced motion | `useLoop` / `useLifecycle` — handle it automatically |
| CSS can do it                       | `@media` query in CSS — no JS needed                 |

## Do

- Use for conditional rendering based on viewport:
  ```tsx
  const isMobile = useMediaQuery('(max-width: 768px)');
  return isMobile ? <MobileNav /> : <DesktopNav />;
  ```
- Multiple `useMediaQuery` calls with the same query share one `MediaQueryList` (pooled).

## Don't

- **Don't use for element-level responsiveness** — media queries are viewport-scoped. Use `useContainerQuery`.
- **Don't rely on the initial `false`** — during SSR and hydration the value is `false`. Design fallback UI accordingly.

## Reduced motion

`useMediaQuery('(prefers-reduced-motion: reduce)')` is the reactive way to check reduced motion. But for animation primitives, you don't need this — all hooks handle it automatically.

## See also

- [useContainerQuery](./use-container-query.md) — element-level breakpoints
- [prefers-reduced-motion](./prefers-reduced-motion.md) — synchronous one-shot check
- [useSize](./use-size.md) — raw element dimensions

---

# `usePresence`

The hook behind `<Presence>`. Composable mount/unmount lifecycle with CSS transitions — enter via `@starting-style`, exit coordinated by JS waiting for `transitionend`/`animationend`.

## Signature

```ts
import { usePresence } from 'phase/react';

const { phase, phaseReason, mounted, ref, enter } = usePresence(options);
```

### Options

| Option          | Type                     | Default     | Description                       |
| --------------- | ------------------------ | ----------- | --------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                 |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount behavior              |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)      |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion handling           |

### Return

| Property      | Type                         | Description                                                           |
| ------------- | ---------------------------- | --------------------------------------------------------------------- |
| `phase`       | `PresencePhase`              | `'idle' \| 'entered' \| 'exiting' \| 'exited'`                        |
| `phaseReason` | `PresenceReason`             | `'initial' \| 'show' \| 'hide' \| 'animation-end' \| 'interrupted'`   |
| `mounted`     | `boolean`                    | Whether the element should be in the DOM                              |
| `ref`         | `RefObject<Element \| null>` | Attach to the animated element (needed for `transitionend` listening) |
| `enter`       | `'animate' \| 'instant'`     | Whether to stamp `data-enter="animate"` (accounts for reduced motion) |

## When to use

- Custom mount/unmount transitions where you need full control over markup and styling.
- Building your own presence component with custom elements or logic.
- When `<Presence>` component's `div` wrapper doesn't fit your DOM structure.

## When NOT to use — reach for X instead

| Instead of this                       | Use                                       |
| ------------------------------------- | ----------------------------------------- |
| Simple show/hide with default div     | `<Presence>` component — less boilerplate |
| Coordinated exit→enter between states | `<Swap>` component                        |
| Viewport-gated lazy mount             | `<WhenVisible>` component                 |

## Do

- Cleanup is automatic — exit timers and event listeners are cleared on unmount.
- Use the canonical CSS pattern:
  ```tsx
  const { phase, ref, mounted, enter } = usePresence({ show: isOpen });
  if (!mounted) return null;
  return (
    <div
      ref={ref}
      data-phase={phase}
      data-enter={enter === 'animate' ? 'animate' : undefined}
      className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
    />
  );
  ```
- Always attach the `ref` — needed for `transitionend`/`animationend` listening.
- Use `mode: 'reveal'` for SEO content or IO re-entry (stays in DOM, toggles visibility).

## Don't

- **Don't forget to attach `ref`** — without it, exit animation has no element to listen on and relies on the safety timeout.
- **Don't set `exitDuration` too low** — if it's shorter than your CSS transition, the element unmounts mid-animation.
- **Don't use `usePresence` for per-frame animation** — it coordinates mount/unmount transitions only. Use `useLoop` for continuous animation.

## Reduced motion

Default `'respect'`: `enter` is `'instant'` (no `data-enter="animate"` stamped), exit is instant (no `exiting` phase, immediate unmount). Decorative animations are skipped; the element still appears and disappears.

## See also

- [presence](./presence.md) — declarative `<Presence>` component wrapping usePresence
- [swap](./swap.md) — coordinated exit→enter for multiple states
- [when-visible](./when-visible.md) — viewport-gated lazy mount

---

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

## When NOT to use — reach for X instead

| Instead of this                 | Use                              |
| ------------------------------- | -------------------------------- |
| Pausing a phase loop off-screen | Nothing — phase loops self-pause |
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

- **Don't use it to gate phase loops** — `useLoop`/`useCanvas`/`useLifecycle` already self-pause off-screen.
- **Don't change layout or unmount on `'skipped'`** — that reintroduces layout shift.

## Does this affect layout or CLS?

No. The hook only observes and reports. Pausing CPU work in response has no layout effect — `content-visibility`'s no-layout-shift guarantee stays intact.

## Reduced motion

Not applicable — render-state is a paint signal, not an animation.

## See also

- [rendering-recipes](./rendering-recipes.md) — gating raw loops inside a `Defer` and other compositions
- [create-render-state](./create-render-state.md) — the core primitive behind this hook
- [defer](./defer.md) — the component whose render-skip state this reads
- [use-sight](./use-sight.md) — viewport visibility as a phase

---

# `useScrollProgress`

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management. Re-renders only at threshold crossings.

## Signature

```ts
import { useScrollProgress } from 'phase/react';

const { ref, progress } = useScrollProgress<T>(options?);
```

### Options

| Option       | Type                   | Default  | Description                        |
| ------------ | ---------------------- | -------- | ---------------------------------- |
| `ref`        | `RefObject<T \| null>` | returned | Bring your own ref                 |
| `steps`      | `number`               | `20`     | Number of evenly-spaced thresholds |
| `root`       | `Element \| null`      | —        | IO root element                    |
| `rootMargin` | `string`               | —        | IO root margin                     |

### Return

| Property   | Type                   | Description                                           |
| ---------- | ---------------------- | ----------------------------------------------------- |
| `ref`      | `RefObject<T \| null>` | Attach to the observed element                        |
| `progress` | `number`               | Fraction visible (0–1). `0` before first observation. |

## When to use

- Reveal/opacity effects driven by how much of an element is visible.
- Progress indicators tied to viewport coverage.
- Simple parallax effects (clamped to element visibility, not scroll position).

## When NOT to use — reach for X instead

| Instead of this                       | Use                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| Continuous scroll-scrubbing           | `motion`'s `useScroll` or native `ScrollTimeline`                 |
| Boolean visibility                    | `useSight`                                                        |
| Per-frame DOM writes driven by scroll | `createScrollProgress` + `useLoop` (avoid setState per threshold) |

## Do

- Cleanup is automatic — the observer is unsubscribed on unmount.
- Use for declarative reveal effects:
  ```tsx
  const { ref, progress } = useScrollProgress();
  return (
    <div ref={ref} style={{ opacity: progress }}>
      {children}
    </div>
  );
  ```
- Adjust `steps` for smoother or coarser updates (higher = more re-renders).

## Don't

- **Don't expect continuous values** — updates only at threshold crossings (~20 per viewport traversal at default steps).
- **Don't use for tall elements expecting full 0→1 scroll** — ratio plateaus once the element fills the viewport. Use `ScrollTimeline`.

## Reduced motion

`useScrollProgress` doesn't handle reduced motion — it's a ratio, not an animation. If using the ratio for decorative animation, check `prefersReducedMotion()` or use `useLoop` which handles it.

## See also

- [createScrollProgress](./create-scroll-progress.md) — framework-agnostic core
- [useSight](./use-sight.md) — boolean visibility instead of ratio
- [useLoop](./use-loop.md) — if you need per-frame writes, combine with createScrollProgress

---

# `useSight`

Element visibility as a phase (`visible` / `hidden`). Wraps `createSight` with React lifecycle management.

## Signature

```ts
import { useSight } from 'phase/react';

const { ref, phase, phaseReason } = useSight<T>(options?);
```

### Options

| Option       | Type                     | Default        | Description                                              |
| ------------ | ------------------------ | -------------- | -------------------------------------------------------- |
| `ref`        | `RefObject<T \| null>`   | returned       | Bring your own ref                                       |
| `observe`    | `'continuous' \| 'once'` | `'continuous'` | `'once'` freezes at `'visible'` after first intersection |
| `root`       | `Element \| null`        | —              | IO root element                                          |
| `rootMargin` | `string`                 | —              | IO root margin                                           |
| `threshold`  | `number \| number[]`     | —              | IO threshold                                             |

### Return

| Property      | Type                   | Description                                                          |
| ------------- | ---------------------- | -------------------------------------------------------------------- |
| `ref`         | `RefObject<T \| null>` | Attach to the observed element                                       |
| `phase`       | `SightPhase`           | `'unknown' \| 'visible' \| 'hidden'`                                 |
| `phaseReason` | `SightReason`          | `'initial' \| 'viewport' \| 'document' \| 'bfcache' \| 'all-hidden'` |

## When to use

- Lazy-mounting content on viewport entry (analytics, video playback, data loading).
- Tracking impressions.
- Conditionally rendering based on visibility (not animation gating — use `useLifecycle` for that).
- `observe: 'once'` for one-shot triggers (load data when first visible, never unload).

## When NOT to use — reach for X instead

| Instead of this                                | Use                                                 |
| ---------------------------------------------- | --------------------------------------------------- |
| Gating an animation loop                       | `useLifecycle` — adds reduced motion + manual pause |
| Viewport-gated lazy mount with enter animation | `WhenVisible` component                             |
| Intersection ratio (scroll progress)           | `useScrollProgress`                                 |

## Do

- Cleanup is automatic — the observer is disconnected on unmount.
- Use `observe: 'once'` for triggers that should never reverse:
  ```tsx
  const { ref, phase } = useSight({ observe: 'once' });
  if (phase === 'visible') loadData();
  ```
- Check `phaseReason` to distinguish viewport leave from tab switch.

## Don't

- **Don't use for animation gating** — `useSight` doesn't know about reduced motion. Use `useLifecycle`.
- **Don't create raw `IntersectionObserver`** — `useSight` uses the pooled IO automatically.

## Reduced motion

Not applicable — `useSight` reports pure visibility. If using it to gate animation, switch to `useLifecycle`.

## See also

- [useLifecycle](./use-lifecycle.md) — visibility + reduced motion + manual pause for animation gating
- [when-visible](./when-visible.md) — declarative one-shot viewport lazy mount
- [useScrollProgress](./use-scroll-progress.md) — intersection ratio (0–1)
- [createSight](./create-sight.md) — framework-agnostic core

---

# `useSize`

Element dimensions via the shared ResizeObserver singleton. Never calls `getBoundingClientRect()`.

## Signature

```ts
import { useSize } from 'phase/react';

const { ref, size } = useSize<T>(options?);
```

### Options

| Option | Type                   | Default  | Description        |
| ------ | ---------------------- | -------- | ------------------ |
| `ref`  | `RefObject<T \| null>` | returned | Bring your own ref |

### Return

| Property | Type                   | Description                                           |
| -------- | ---------------------- | ----------------------------------------------------- |
| `ref`    | `RefObject<T \| null>` | Attach to the measured element                        |
| `size`   | `Size \| null`         | `{ width, height }` or `null` until first observation |

## When to use

- Reading element dimensions without forced reflows.
- Responsive logic based on actual element size (not viewport).
- Feeding dimensions to canvas sizing, layout calculations, or animations.

## When NOT to use — reach for X instead

| Instead of this                         | Use                                                     |
| --------------------------------------- | ------------------------------------------------------- |
| Breakpoint matching (only need boolean) | `useContainerQuery` — re-renders only on boundary cross |
| Viewport size                           | CSS viewport units or `window.innerWidth`               |
| Canvas sizing                           | `useCanvas` — handles resize internally                 |

## Do

- Use for dimension-aware rendering:
  ```tsx
  const { ref, size } = useSize();
  return (
    <div ref={ref}>
      {size ? `${size.width}x${size.height}` : 'measuring...'}
    </div>
  );
  ```
- Re-renders only when dimensions actually change (deduped internally).

## Don't

- **Don't use `getBoundingClientRect()` as a fallback** — it forces a synchronous reflow. Trust the async RO callback.
- **Don't use when you only need a breakpoint boolean** — `useContainerQuery` re-renders less often.

## Reduced motion

Not applicable — `useSize` reports dimensions, not animation.

## See also

- [useContainerQuery](./use-container-query.md) — breakpoint matching (fewer re-renders)
- [useCanvas](./use-canvas.md) — canvas sizing handled automatically
- [useScrollProgress](./use-scroll-progress.md) — visibility ratio, not dimensions

---

# `useStableCallback`

Returns a function with stable identity that always calls the latest version of `callback`. Safe in deps arrays and as a prop to `memo()`'d children.

## Signature

```ts
import { useStableCallback } from 'phase/react';

const stable = useStableCallback(callback);
```

### Parameters

| Parameter  | Type                   | Description               |
| ---------- | ---------------------- | ------------------------- |
| `callback` | `(...args: Args) => R` | The function to stabilize |

### Return

`(...args: Args) => R` — same signature, stable identity across renders.

## When to use

- Passing callbacks to memoized children without breaking `React.memo`.
- Using callbacks in effect deps without causing re-runs.
- Event handlers that need latest closure values but stable identity.

## When NOT to use — reach for X instead

| Instead of this                   | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| Per-frame callback (onTick, draw) | `useSyncedRef` — phase hooks use it internally, no consumer action needed |
| Simple memoized value             | `useMemo` / `useCallback` with proper deps                                |

## Do

- Use for stable props to memoized children:
  ```tsx
  const handleClick = useStableCallback(() => {
    console.log(latestCount); // always fresh
  });
  return <MemoizedButton onClick={handleClick} />;
  ```

## Don't

- **Don't use for `onTick`/`draw`** — phase hooks already sync these via `useSyncedRef` internally. Adding `useStableCallback` on top is redundant.
- **Don't use where React's `useCallback` with proper deps suffices** — only reach for this when deps would be unstable or numerous.

## Reduced motion

Not applicable — utility hook, no animation behavior.

## See also

- [useSyncedRef](./use-synced-ref.md) — ref-based value sync (used internally by phase hooks)
- [useLoop](./use-loop.md) — uses useSyncedRef for onTick automatically

---

# `useSyncedRef`

Ref whose `.current` is always the latest value, updated synchronously on every render. Readable from any callback or effect without triggering re-render.

## Signature

```ts
import { useSyncedRef } from 'phase/react';

const ref: RefObject<T> = useSyncedRef(value);
```

### Parameters

| Parameter | Type | Description               |
| --------- | ---- | ------------------------- |
| `value`   | `T`  | Any value to keep in sync |

### Return

`RefObject<T>` — `.current` is always the latest `value`.

## When to use

- Storing the latest version of a callback for use inside `onTick` / `draw` without restarting effects.
- Accessing the latest props/state from inside event handlers or effects with empty deps arrays.
- Internal use: `useLoop` and `useCanvas` use this internally to keep `onTick`/`draw` fresh.

## When NOT to use — reach for X instead

| Instead of this                         | Use                                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| Stable-identity callback for props/deps | `useStableCallback` — returns a callable function, not a ref   |
| DOM element ref                         | Standard `useRef` — `useSyncedRef` is for values, not elements |

## Do

- Use to avoid effect restarts when a callback changes:
  ```tsx
  const onTickRef = useSyncedRef(onTick);
  useEffect(() => {
    const id = setInterval(() => onTickRef.current(), 16);
    return () => clearInterval(id);
  }, []); // no deps on onTick — ref is always fresh
  ```

## Don't

- **Don't use in deps arrays** — the ref object identity is stable, so it won't trigger re-runs. Read `.current` inside the effect body instead.
- **Don't use for state that should trigger re-renders** — refs don't re-render. Use `useState` for reactive state.

## Reduced motion

Not applicable — utility hook, no animation behavior.

## See also

- [useStableCallback](./use-stable-callback.md) — stable-identity function (callable, not a ref)
- [useLoop](./use-loop.md) — uses useSyncedRef internally for onTick

---

# `useTween`

Animates a number from its current position to `target` over a duration. Calls `setState` per frame — appropriate when the animated value is used in render output and the render is cheap.

## Signature

```ts
import { useTween } from 'phase/react';

const value: number = useTween(options);
```

### Options

| Option          | Type                                | Default        | Description                   |
| --------------- | ----------------------------------- | -------------- | ----------------------------- |
| `target`        | `number`                            | required       | Value to animate toward       |
| `duration`      | `number`                            | `300`          | Animation duration in ms      |
| `delay`         | `number`                            | `0`            | Delay before starting in ms   |
| `easing`        | `(progress: number) => number`      | `easeOutCubic` | Easing function               |
| `enabled`       | `boolean`                           | `true`         | When `false`, jumps to target |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'` | `'complete'`   | Behavior under reduced motion |

### Return

Returns the current animated `number`.

## When to use

- Counters, progress bars, opacity, single-value animations where the render tree below is cheap.
- The animated value must be in React state (rendered in JSX, not written to DOM directly).
- You want easing and interruption handling.

## When NOT to use — reach for X instead

| Instead of this                         | Use                              |
| --------------------------------------- | -------------------------------- |
| Many elements or expensive renders      | `useLoop` + ref-based DOM writes |
| Canvas animation                        | `useCanvas`                      |
| Pure CSS can do it (opacity, transform) | CSS `transition`                 |
| Spring physics                          | External library (motion)        |

## Do

- Use for cheap single-value tweens:
  ```tsx
  const opacity = useTween({ target: isVisible ? 1 : 0, duration: 300 });
  return <div style={{ opacity }}>{content}</div>;
  ```
- Change `target` to interrupt and re-animate from current position (smooth interruption).
- Use `delay` for staggered animations across multiple elements.

## Don't

- **Don't animate many values with separate `useTween` calls** — each triggers a re-render per frame. Use `useLoop` for batch DOM animation.
- **Don't pass `duration: 0` or negative** — throws `PhaseError` with code `invalid_duration`.
- **Don't use for canvas or WebGL** — `useTween` drives React state. Use `useCanvas`.

## Reduced motion

Default `'complete'`: jumps to target instantly. The value still arrives at its destination; the animation is skipped. This is the right default for tweens that must reach their final state.

## See also

- [useLoop](./use-loop.md) — per-frame DOM animation via refs (no re-renders)
- [ease](./ease.md) — easing functions used by useTween
- [useCanvas](./use-canvas.md) — canvas/WebGL animation

---

# `useWhenIdle`

Runs a callback once, when the browser is idle after mount. The effect-shaped counterpart to `useIdle` — for side effects (prefetching, cache warming, `import()`), not rendering. Cancels on unmount and always calls the latest callback.

## Signature

```ts
import { useWhenIdle } from 'phase/react';

useWhenIdle(() => void import('./heavy-panel'), { timeout: 2000 });
```

### Arguments

| Argument   | Type          | Description                                      |
| ---------- | ------------- | ------------------------------------------------ |
| `callback` | `() => void`  | Runs once when the browser is idle after mount   |
| `options`  | `IdleOptions` | `{ timeout?: number }` — max ms to wait for idle |

## When to use

- Prefetch a code-split chunk so it is cached before the user needs it (`import()`).
- Warm a cache, hydrate a store, or kick off non-urgent network work after first paint.
- Any "do this when there's spare time" side effect that should not block the critical path.

## When NOT to use — reach for X instead

| Instead of this                       | Use                           |
| ------------------------------------- | ----------------------------- |
| Rendering something once idle         | `useIdle` (returns a boolean) |
| A one-off idle callback outside React | `whenIdle` (imperative core)  |
| Mounting a subtree when idle          | `WhenIdle`                    |

## Do

- **Prefetch a heavy panel during idle so it opens instantly later:**
  ```tsx
  useWhenIdle(() => void import('./chat-panel-with-chat'));
  ```
- **Pass `timeout`** when the work should run even on a busy main thread within a bound.

## Don't

- **Don't use it to gate rendering** — it returns nothing. Use `useIdle` for a boolean you render from.
- **Don't add cleanup yourself** — the hook cancels on unmount automatically. Hand-rolled `requestIdleCallback` in a `useEffect` commonly forgets `cancelIdleCallback` (a leak) and the SSR guard; `useWhenIdle` handles both.

## Reduced motion

Not applicable — `useWhenIdle` is a scheduling primitive, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [use-idle](./use-idle.md) — the boolean form, for rendering once idle
- [when-idle](./when-idle.md) — mount a subtree once idle
- [rendering-recipes](./rendering-recipes.md) — prefetching and composing the rendering helpers

---

# `WhenIdle`

Mounts children once the browser is idle after first paint. One-shot (once mounted, stays mounted). Backed by the `whenIdle` core utility (`requestIdleCallback`). Use it to defer non-critical UI off the critical path.

## Signature

```tsx
import { WhenIdle } from 'phase/react';

<WhenIdle fallback={<Skeleton />} timeout={2000} className="...">
  <SecondaryPanel />
</WhenIdle>;
```

```ts
// Core utility
import { whenIdle } from 'phase';

const cancel = whenIdle(() => warmCache(), { timeout: 2000 });
cancel(); // optional: prevent the callback before it runs
```

### Props (`WhenIdle`)

| Prop       | Type                    | Default | Description                           |
| ---------- | ----------------------- | ------- | ------------------------------------- |
| `timeout`  | `number`                | —       | Max ms to wait before mounting anyway |
| `fallback` | `ReactNode`             | —       | Shown until the browser is idle       |
| `ref`      | `Ref<HTMLDivElement>`   | —       | Forward a ref (after mount)           |
| ...rest    | `ComponentProps<'div'>` | —       | All standard div props                |

### Options (`whenIdle`)

| Option    | Type     | Default | Description                                      |
| --------- | -------- | ------- | ------------------------------------------------ |
| `timeout` | `number` | —       | Max ms to wait before running even if never idle |

### Data attributes stamped (after idle)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Non-critical UI that should not compete with first paint (secondary panels, below-the-fold widgets, analytics).
- Work that must run eventually but not on the critical path (`whenIdle` for cache warming, prefetch).

## When NOT to use — reach for X instead

| Instead of this                     | Use                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Content that must be in SSR HTML    | `Defer` — `WhenIdle` children are not server-rendered |
| Mount when scrolled into view       | `WhenVisible`                                         |
| Critical content needed immediately | Render it directly — don't defer                      |

## Do

- **Render the `fallback` at the final content's height** to avoid layout shift when children mount:
  ```tsx
  <WhenIdle fallback={<Skeleton className="h-[320px]" />}>
    <Comments />
  </WhenIdle>
  ```
- **Set a `timeout`** when the work should not wait indefinitely on a busy main thread.

## Don't

- **Don't use for above-the-fold or SEO-critical content** — idle never fires during SSR, so children are absent from server HTML.
- **Don't expect unmount** — like `WhenVisible`, it is one-shot.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts — only the enter animation is skipped.

## See also

- [rendering-recipes](./rendering-recipes.md) — composing `WhenIdle` with `lazy()`, `Suspense`, and the other helpers
- [when-visible](./when-visible.md) — gate mounting on viewport entry
- [defer](./defer.md) — keep content in the DOM but skip painting
- [use-idle](./use-idle.md) — the boolean hook behind `WhenIdle`
- [use-when-idle](./use-when-idle.md) — run a side effect (prefetch, `import()`) once idle

---

# `WhenVisible`

Mounts children when the element enters the viewport. One-shot (once triggered, stays mounted). Uses pooled IntersectionObserver via `useSight`.

## Signature

```tsx
import { WhenVisible } from 'phase/react';

<WhenVisible rootMargin="200px" className="...">
  <HeavyContent />
</WhenVisible>;
```

### Props

| Prop         | Type                    | Default   | Description                       |
| ------------ | ----------------------- | --------- | --------------------------------- |
| `rootMargin` | `string`                | `'200px'` | IO rootMargin (preload headroom)  |
| `threshold`  | `number \| number[]`    | —         | IO threshold                      |
| `root`       | `Element \| null`       | —         | IO root element                   |
| `fallback`   | `ReactNode`             | —         | Shown while awaiting intersection |
| `ref`        | `Ref<HTMLDivElement>`   | —         | Forward a ref                     |
| ...rest      | `ComponentProps<'div'>` | —         | All standard div props            |

### Data attributes stamped (after visible)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Viewport-gated lazy loading (heavy charts, images, interactive widgets).
- Code-split components that should only load when scrolled into view.
- Scroll-triggered reveal animations (fade in on enter).

## When NOT to use — reach for X instead

| Instead of this             | Use                                             |
| --------------------------- | ----------------------------------------------- |
| Show/hide that can reverse  | `<Presence>` with `mode: 'reveal'`              |
| Need exit animation         | `<Presence>` — WhenVisible is one-shot, no exit |
| Boolean visibility tracking | `useSight` — for observation without mounting   |

## Do

- Combine with `lazy()` + `Suspense` for code-split lazy loading:
  ```tsx
  const HeavyChart = lazy(() => import('./heavy-chart'));
  <WhenVisible
    rootMargin="200px"
    className="transition-opacity data-[enter=animate]:starting:opacity-0"
  >
    <Suspense fallback={<Skeleton />}>
      <HeavyChart />
    </Suspense>
  </WhenVisible>;
  ```
- Use `rootMargin` to preload before the element is visible (e.g. `'200px'` starts loading 200px early).
- **Render the `fallback` at the final content's height** so nothing shifts when children mount.
- In Next.js, prefer `next/dynamic` over `lazy()` (SSR-aware, integrates a `loading` placeholder). See [rendering-recipes.md](./rendering-recipes.md).

## Don't

- **Don't expect it to unmount when scrolled away** — it's one-shot. Once visible, stays mounted.
- **Don't use for exit animations** — `WhenVisible` has no exit phase. Use `<Presence>`.
- **Don't set `rootMargin: '0px'`** unless you want no preloading headroom.
- **Don't ship a zero-height `fallback`** — a mismatched placeholder height causes layout shift on mount.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts — the enter animation is simply skipped.

## See also

- [rendering-recipes](./rendering-recipes.md) — two-tier `Defer` + `WhenVisible` and other compositions
- [presence](./presence.md) — show/hide with exit animation
- [useSight](./use-sight.md) — boolean visibility without mounting
- [swap](./swap.md) — coordinated state transitions
