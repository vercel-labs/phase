<!-- GENERATED — do not edit. Run: node skills/phase/scripts/build-agents.mjs -->

---

name: phase
description: "Use when building, reviewing, or optimizing web animations OR rendering performance (frame loops, scroll/viewport reveals, mount/unmount transitions, canvas/WebGL lifecycles, reduced-motion handling, lazy rendering, deferring off-screen or non-critical work) with the phase library. Also use when auditing existing animation or rendering code to decide between CSS-only, minimal JS, phase, or a heavier library like motion. Trigger on janky animations, per-frame allocations, forced reflows, re-renders from animation loops, animations that don't pause off-screen, missing reduced-motion support, content-visibility, lazy-mounting on viewport or idle, requestIdleCallback, deferring rendering of long pages, or questions like 'should I use CSS or JS for this animation' or 'how do I render this off-screen content faster'. Always use this skill when you mention phase or any phase export."
license: MIT
metadata:
author: vercel
version: '0.0.8'
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

| Need                                                 | Use                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Know if it's on screen?                              | `useSight`                                                                                  |
| Want phase to run your frame loop?                   | `useLoop` (DOM) / `useCanvas` (canvas)                                                      |
| You own the loop (WebGL, three.js, Web Worker)?      | `useLifecycle` (active/paused signal)                                                       |
| Animating one value into render?                     | `useTween`                                                                                  |
| Mount/unmount transitions?                           | `Presence` / `Swap` / `WhenVisible`                                                         |
| Skip painting off-screen content (keep in DOM)?      | `Defer`                                                                                     |
| Mount non-critical UI when idle?                     | `WhenIdle` / `useIdle`                                                                      |
| Run a side effect (prefetch, `import()`) when idle?  | `useWhenIdle`                                                                               |
| Pause raw work inside a `Defer` subtree?             | `useRenderState`                                                                            |
| React to DOM mutations without reflow?               | `useMutation`                                                                               |
| Reactive scroll/size/media values?                   | `useScrollProgress` / `useSize` / `useContainerQuery` / `useMediaQuery`                     |
| Scroll/size/visibility without re-renders?           | Same hooks with a callback (`onProgress` / `onResize` / `onVisibilityChange`), read via ref |
| Reactive reduced-motion check for non-phase code?    | `usePrefersReducedMotion`                                                                   |
| Need reactive `devicePixelRatio` for buffer sizing?  | `useDevicePixelRatio`                                                                       |
| Visibility-aware timed sequences (do X, wait, do Y)? | `useLoop` with `fps: 1–2` and `frame.elapsed`-based steps                                   |

## React first

In React components, prefer the React hooks (`useLoop`, `useCanvas`, `useLifecycle`, `useSight`, etc.) over the core API (`createLoop`, `createTicker`, `createLifecycle`, `createSight`). Hooks manage refs, teardown, and React lifecycle automatically. Using `createLoop` inside a `useEffect` when `useLoop` would work is a bug waiting to happen (manual cleanup, stale refs, no `enabled` prop).

Reach for core primitives in React when the hook doesn't fit: building a custom hook on top of `createLoop`, composing multiple primitives via a shared `AbortController`, or wiring up an imperative manager that owns its own lifecycle. In those cases you own the teardown — call `stop()` or abort the signal in the effect cleanup.

## Non-negotiable invariants

Tests enforce these guarantees for animation hot paths. Violating them in consumer code is always a bug. (Rendering helpers carry one rule of their own: reserve fallback height so `WhenVisible` / `WhenIdle` don't shift layout, see [references/rendering-recipes.md](references/rendering-recipes.md).)

1. **Zero per-frame allocations.** No objects, arrays, closures, template literals, or spreads in `onTick`/`draw`.
2. **Never `setState` inside `onTick`.** Write to refs or the DOM directly. Only phase changes trigger re-renders.
3. **No forced reflows.** Never call `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()` in animation paths. Use `useSize` / ResizeObserver.
4. **Strong pause.** `cancelAnimationFrame()` stops scheduling entirely. Zero callbacks, zero CPU when paused.
5. **Reduced motion by default.** All primitives respect `prefers-reduced-motion: reduce` automatically. Bypassing requires explicit `reducedMotion: 'ignore'`.
6. **Frame-locked shared clock.** One `performance.now()` per rAF frame. Multiple animations stay in sync.

For the full performance ruleset, read [references/performance.md](references/performance.md).

## Export taxonomy

Every export belongs to a category. The choosing table above picks the primitive; this table shows the organizational structure.

| Category    | What it covers                               | Exports                                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timing      | Frame clocks and animation loops             | `createTicker`, `createLoop`, `useLoop`, `useCanvas`, `useTween`                                                                                                                                                                                                                                    |
| Observation | Reactive wrappers around browser observers   | `createSight`, `createScrollProgress`, `createRenderState`, `createDevicePixelRatio`, `createMutation`, `useSight`, `useScrollProgress`, `useSize`, `useContainerQuery`, `useMediaQuery`, `useRenderState`, `useDevicePixelRatio`, `usePrefersReducedMotion`, `useMutation`, `prefersReducedMotion` |
| Lifecycle   | Activation signals composed from IO+MQL+rIC  | `createLifecycle`, `useLifecycle`, `whenIdle`, `useIdle`, `useWhenIdle`                                                                                                                                                                                                                             |
| Composition | Mount/unmount orchestration with transitions | `Presence`, `usePresence`, `Swap`, `WhenVisible`, `WhenIdle`, `Defer`                                                                                                                                                                                                                               |
| Math        | Pure easing and interpolation functions      | `clamp`, `clamp01`, `lerp`, `inverseLerp`, `remap`, `easeOutCubic`, `easeOutQuart`, `easeOutBack`, `easeInOutCubic`, `linear`                                                                                                                                                                       |
| Utility     | React ref/callback patterns for phase users  | `useSyncedRef`, `useStableCallback`                                                                                                                                                                                                                                                                 |

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
| `createMutation`              | Lifecycle-aware MutationObserver with rAF batching   | [create-mutation.md](references/create-mutation.md)                     |
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
| `useMutation`             | Lifecycle-aware MutationObserver with rAF batching       | [use-mutation.md](references/use-mutation.md)                             |
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
| [timed-sequences.md](references/timed-sequences.md)     | Building multi-step timed animation sequences with `useLoop`         |

## Full compiled document

For all references expanded inline: `AGENTS.md`

---

# Abort signals

Every core primitive that subscribes to something (`createTicker`, `createSight`, `createLifecycle`, `createLoop`, `createScrollProgress`, `createRenderState`, `createDevicePixelRatio`) and the one-shot `whenIdle` accept an optional `signal?: AbortSignal`. When the signal aborts, the primitive tears itself down exactly as if you had called its `stop()` (or the cancel function `whenIdle` returns).

This is purely additive. `stop()` and the cancel return value still work; `signal` is a second way to trigger the same teardown.

## When to use `signal` vs `stop()`

| Situation                                                                | Use      |
| ------------------------------------------------------------------------ | -------- |
| One controller tears down several primitives from a single cleanup path  | `signal` |
| You already hold the instance and want to stop just that one             | `stop()` |
| A parent already exposes an `AbortSignal` (fetch, event handler, effect) | `signal` |
| Composing with `AbortSignal.timeout()` or `AbortSignal.any([...])`       | `signal` |

The win is collapsing many teardown calls into one `controller.abort()`. For a single primitive you already have a handle to, `stop()` is simpler.

## Semantics

- **Abort runs teardown once.** After the signal aborts, the primitive is stopped; further aborts and a manual `stop()` are no-ops.
- **Already-aborted signal.** If the signal is aborted before you pass it, the primitive never subscribes (or stops immediately). No dangling observers.
- **Manual `stop()` unlinks the listener.** Stopping by hand removes the abort listener, so a long-lived controller never retains a reference to a stopped primitive.

## Do

- Drive several primitives from one controller and abort them together:

  ```ts
  const controller = new AbortController();
  const { signal } = controller;

  createSight({ element, onPhaseChange, signal });
  createDevicePixelRatio({ onChange: scheduleResize, signal });
  const loop = createLoop({ element, onTick, signal });

  // one teardown for all three:
  return () => controller.abort();
  ```

- Reuse a signal you already have (e.g. from a parent effect or a fetch) instead of threading `stop()` calls through your own cleanup.

## Don't

- **Don't return the method reference directly.** `controller.abort` loses its `this` and throws `Illegal invocation`. Wrap it:
  ```ts
  return () => controller.abort(); // correct
  return controller.abort; // wrong — detached, throws when called
  ```
- **Don't pass `signal` to React hooks.** The hooks (`useLoop`, `useSight`, …) already tear down in their `useEffect` cleanup. `signal` is a core-primitive concern.
- **Don't reuse an aborted controller.** Once aborted it stays aborted; create a fresh `AbortController` for a new lifecycle.

## See also

- [create-loop.md](./create-loop.md), [create-lifecycle.md](./create-lifecycle.md), [create-ticker.md](./create-ticker.md), [create-sight.md](./create-sight.md). Primitives that accept `signal`
- [when-idle.md](./when-idle.md). `whenIdle` cancels the scheduled callback on abort

---

# Animation audit procedure

A repeatable procedure for auditing existing animation code. Surfaces anti-pattern candidates deterministically, then classifies each against the [decision guide](./decision-guide.md) ladder.

## When to run

- User asks to review, optimize, or audit animation code.
- User reports janky animations, high CPU usage, or excessive re-renders.
- User asks "can this use CSS instead?" or "should I use phase here?"
- User asks to replace an existing animation library with phase.

## Step 1: Scan for candidates

Run the deterministic scanner bundled with this skill on the target directory. The script lives at `scripts/scan.mjs` relative to this skill's directory. Resolve it from wherever the skill is installed (e.g. `skills/phase/scripts/scan.mjs` in the phase repo, or `.agents/skills/phase/scripts/scan.mjs` in a consuming project):

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
| MutationObserver → layout   | `new MutationObserver` observing `attributes`/`style` or reading layout in its callback                                  | Forces synchronous reflow on every mutation        |
| JS-driven opacity/transform | `style.opacity =` or `style.transform =` with no visibility gating                                                       | Could be CSS, or needs phase for lifecycle         |
| Missing reduced motion      | Animation code without `prefers-reduced-motion` or phase primitives                                                      | Accessibility gap                                  |
| Background animation        | `setInterval`/`setTimeout` for animation without visibility check                                                        | Wastes CPU off-screen                              |
| Reflow for visibility check | `getBoundingClientRect()` used to determine if element is in view                                                        | Forces synchronous layout; IO is one frame away    |
| Permanent `will-change`     | `will-change-transform` always on, not toggled with animation state                                                      | Wastes GPU memory when idle                        |
| Manual visibility gate      | Hand-wired IO + visibilitychange + reduced motion to produce a boolean                                                   | Reimplements `useLifecycle`; fragile, verbose      |

The scanner also emits one **dedup** signal, reported separately from the anti-patterns above because it flags correct code, not a defect:

| Signal (dedup)    | Pattern                                                                                                     | Note                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Manual synced ref | `const xRef = useRef(v)` immediately followed by an unconditional `xRef.current = v` mirroring the same `v` | This is the correct React latest-ref idiom; `useSyncedRef` is just a one-line shorthand. Optional cleanup, never a defect. |

Output is a list of candidate sites: `file:line` with the matched pattern. Dedup findings are listed after the anti-patterns and excluded from the actionable count.

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
- **Show before/after code.** Keep snippets minimal, only the relevant change, not the entire file.

## Common replacements

| Current pattern                                                      | Replace with                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | `useLoop` (if DOM) or `useCanvas` (if canvas)                                                                                                                                                         |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same, plus the cleanup is now automatic                                                                                                                                                               |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                                                                                                                                                          |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                                                                                                                                                                   |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                                                                                                                                                             |
| `MutationObserver` on `style`/`attributes` to track size or position | `useSize` (ResizeObserver) / `useSight` (IO); reserve MO for `childList`                                                                                                                              |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)                                                                                                                                           |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                                                                                                                                                            |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                                                                                                                                                       |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                                                                                                                                                          |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                                                                                                                                                         |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                                                                                                                                                           |
| CSS-only animation that's working fine                               | No change. Don't add JS where it's not needed.                                                                                                                                                        |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` (single hook, same signals, pooled IO)                                                                                                                                                 |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`                                                                                                                                               |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops                                                                                                                                          |
| `setTimeout`/`setInterval` for timed animation sequences             | `useLoop` with `fps: 1–2` and `frame.elapsed`-based steps (see [timed-sequences.md](./timed-sequences.md)); or CSS `@keyframes` + `useLifecycle` toggling `animation-play-state` if purely CSS-driven |
| `useRef(v)` + unconditional `ref.current = v` on every render        | `useSyncedRef(v)` (dedup, the raw pattern is correct, only verbose)                                                                                                                                   |

## Reviewing phase code

After implementing, migrating, or reviewing animation code that uses phase, ask: **is it using phase to the best of its ability?** Four questions frame the review:

1. **Right tier?** Could CSS handle this alone? Could `useTween` replace a `useLoop` that only animates one value? Is an external library needed (springs, gestures)? The cheapest tier that works wins.
2. **Right primitive?** Within the phase tier, is each primitive the best fit for what it's doing? Read the relevant reference file's "When to use" / "When not to use" tables.
3. **Right options?** Is `fps` set appropriately (e.g., `fps: 1–2` for state-machine transitions, not 60)? Should a hook use transient mode (`onProgress` / `onResize` / `onVisibilityChange`) instead of re-rendering? Is `observe: 'once'` appropriate for one-shot triggers?
4. **Missing phase?** Is there animation or rendering code with no lifecycle management — animations running off-screen, raw observers, missing reduced-motion handling, long pages without `Defer`?

The specific failure modes and correct patterns live in the reference files: [timed-sequences.md](./timed-sequences.md) for the timer anti-pattern and initial-state flash, [performance.md](./performance.md) for hot-path rules, [decision-guide.md](./decision-guide.md) for tier selection and migration mappings.

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical.** Causes jank or accessibility failures
2. **High.** Wastes significant CPU or leaks resources
3. **Medium.** Suboptimal but functional
4. **No change.** Already well-implemented (list briefly for completeness)

End with a summary: "Found N candidates, M actionable, K already optimal."

---

# `createDevicePixelRatio`

Tracks `devicePixelRatio` changes (e.g. dragging the window between monitors with different pixel densities) via a shared `matchMedia` subscription. The framework-agnostic core behind `useDevicePixelRatio`.

## Signature

```ts
import { createDevicePixelRatio } from 'phase';

const watcher = createDevicePixelRatio(options: DevicePixelRatioOptions): DevicePixelRatio;
```

### Options

| Option     | Type                    | Default  | Description                                  |
| ---------- | ----------------------- | -------- | -------------------------------------------- |
| `onChange` | `(dpr: number) => void` | required | Called when devicePixelRatio changes         |
| `signal`   | `AbortSignal`           | —        | Stops the watcher when the signal is aborted |

### Return (DevicePixelRatio)

| Property | Type         | Description                                 |
| -------- | ------------ | ------------------------------------------- |
| `dpr`    | `number`     | Current devicePixelRatio (synchronous read) |
| `stop()` | `() => void` | Unsubscribe and cleanup                     |

## When to use

- Imperative, framework-free code that sizes a buffer by DPR (a resize bridge, a worker host, a vanilla WebGL setup).
- You need a synchronous `dpr` read plus a change subscription, outside React.

## When not to use

| Instead of this                        | Use                                           |
| -------------------------------------- | --------------------------------------------- |
| React component                        | `useDevicePixelRatio`                         |
| Canvas animation with DPR-aware sizing | `useCanvas` / `createLoop` handle DPR for you |
| One-shot read with no subscription     | `window.devicePixelRatio` directly            |

## Do

- Drive a resize bridge from the change callback and read `dpr` on demand:
  ```ts
  const watcher = createDevicePixelRatio({
    onChange: (dpr) => bridge.postMessage({ type: 'dpr', dpr }),
  });
  const bufferWidth = cssWidth * Math.min(watcher.dpr, 2);
  // cleanup:
  watcher.stop();
  ```
- Apply a performance cap (`Math.min(dpr, 2)`) where the workload is GPU-heavy. The cap is a consumer policy, not a phase concern.
- Multiple instances share one underlying subscription, so creating several is cheap.

## Don't

- **Don't poll `window.devicePixelRatio`.** It does not fire events; this watcher re-subscribes on every change so chained switches (A -> B -> C) are all caught.
- **Don't forget `stop()`.** The subscription lives until the last watcher stops.

## Reduced motion

Not applicable. `createDevicePixelRatio` reports a display property, not animation.

## See also

- [useDevicePixelRatio](./use-device-pixel-ratio.md). React hook wrapping this core
- [useCanvas](./use-canvas.md). Canvas with DPR-aware buffer sizing built in
- [createLifecycle](./create-lifecycle.md). Common pairing for imperative renderers
- [abort-signals](./abort-signals.md). Tear down this watcher via the `signal` option

---

# `createLifecycle`

The activation decision for an animation, decoupled from who drives the frames. Composes visibility (`createSight`), reduced motion, and a manual pause into a single `active` / `paused` phase.

## Signature

```ts
import { createLifecycle } from 'phase';

const lifecycle = createLifecycle(options: LifecycleOptions): Lifecycle;
```

### Options

| Option                | Type                                                       | Default   | Description                                    |
| --------------------- | ---------------------------------------------------------- | --------- | ---------------------------------------------- |
| `element`             | `Element`                                                  | required  | Element to observe for visibility              |
| `reducedMotion`       | `'pause' \| 'ignore'`                                      | `'pause'` | Whether reduced motion pauses the lifecycle    |
| `intersectionOptions` | `IntersectionObserverInit`                                 | —         | Forwarded to pooled IO                         |
| `start`               | `'auto' \| 'manual'`                                       | `'auto'`  | Whether to start immediately                   |
| `onPhaseChange`       | `(phase: LifecyclePhase, reason: LifecycleReason) => void` | —         | Called on phase transitions                    |
| `signal`              | `AbortSignal`                                              | —         | Stops the lifecycle when the signal is aborted |

### Return (Lifecycle)

| Property      | Type              | Description                                                                                    |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `start()`     | `() => void`      | Begin honoring signals (auto by default)                                                       |
| `stop()`      | `() => void`      | Terminal (disposes observers and listeners)                                                    |
| `pause()`     | `() => void`      | Manual pause (lowest priority)                                                                 |
| `resume()`    | `() => void`      | Clear manual pause                                                                             |
| `phase`       | `LifecyclePhase`  | `'idle' \| 'active' \| 'paused' \| 'stopped'`                                                  |
| `phaseReason` | `LifecycleReason` | `'initial' \| 'started' \| 'resumed' \| 'sight' \| 'reduced-motion' \| 'manual' \| 'disposed'` |

## When to use

- You own your render loop (three.js, Pixi, WebGL, a Web Worker) and need phase's lifecycle guarantees without phase driving the clock.
- You want visibility pausing + reduced-motion pausing + manual pause composed into one signal.
- You need `pause()` / `resume()` for UI-driven suspension (e.g. a settings panel covering the animation).

## When not to use

| Instead of this                          | Use                                              |
| ---------------------------------------- | ------------------------------------------------ |
| You want phase to drive the loop for you | `createLoop` (adds the ticker + quality signals) |
| Need visibility only (no reduced motion) | `createSight` (standalone, no motion handling)   |
| React component                          | `useLifecycle` (manages refs and teardown)       |

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
- Gate a framework-free engine loaded via dynamic `import()`. Construct the lifecycle after the module resolves, drive the engine's imperative `start()` / `stop()` from `onPhaseChange`, and dispose both on teardown:

  ```ts
  let lifecycle: Lifecycle | undefined;
  let engine: ScrambleEngine | undefined;
  let cancelled = false;

  import('./scramble-engine').then(({ createScrambleEngine }) => {
    if (cancelled) return; // unmounted before the chunk loaded
    engine = createScrambleEngine(canvas);
    lifecycle = createLifecycle({
      element: canvas,
      onPhaseChange: (phase) => {
        if (phase === 'active') engine?.start();
        else engine?.stop();
      },
    });
  });

  // teardown:
  cancelled = true;
  lifecycle?.stop();
  engine?.dispose();
  ```

  The `cancelled` flag guards the async gap: if teardown runs before the chunk resolves, nothing is constructed. `createLifecycle` defaults to `start: 'auto'`, so it begins honoring signals the moment the engine exists.

## Don't

- **Don't use `pause()` to implement visibility pausing.** Visibility is automatic via the internal `createSight`. Manual pause is for UI-driven scenarios only.
- **Don't call `start()` after `stop()`.** `stop()` is terminal.
- **Don't confuse with `createLoop`.** Lifecycle gives you a signal; loop gives you a signal AND drives the frames.

## Reduced motion

Default: `'pause'`. The lifecycle reports `phase: 'paused'`, `phaseReason: 'reduced-motion'` when reduced motion is enabled. Your renderer should stop.

With `reducedMotion: 'ignore'`: lifecycle stays `active` regardless. Use only for non-decorative motion.

## See also

- [createLoop](./create-loop.md). Builds on createLifecycle; adds ticker, quality, frame budget
- [createSight](./create-sight.md). Pure visibility (no reduced motion handling)
- [useLifecycle](./use-lifecycle.md). React hook wrapping createLifecycle
- [abort-signals](./abort-signals.md). Stop this lifecycle via the `signal` option

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
| `signal`              | `AbortSignal`                       | —            | Stops the loop when the signal is aborted |

### Return (Loop)

| Property        | Type                          | Description                                    |
| --------------- | ----------------------------- | ---------------------------------------------- |
| `start()`       | `() => void`                  | Begin the loop (no-op if already running)      |
| `stop()`        | `() => void`                  | Terminal (disposes everything)                 |
| `phase`         | `LoopPhase`                   | `'idle' \| 'running' \| 'paused' \| 'stopped'` |
| `phaseReason`   | `LoopReason`                  | Why the current phase was entered              |
| `quality`       | `Quality`                     | `'full' \| 'degraded'`                         |
| `qualityReason` | `DegradedReason \| undefined` | `'unfocused' \| 'frame-budget'`                |

## When to use

- You need a per-frame animation loop that automatically pauses when off-screen or in a background tab.
- You want zero CPU when the element isn't visible (strong pause via `cancelAnimationFrame`).
- You need quality degradation signals (FPS throttle on window blur or frame budget overflow).
- You're animating DOM elements (transforms, opacity, positions) in a frame loop.

## When not to use

| Instead of this                                   | Use                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| You own the renderer (three.js, Pixi, Web Worker) | `createLifecycle` (gives you active/paused signal without driving the loop) |
| Single value into React render                    | `useTween` (smaller API surface, calls setState)                            |
| Pure CSS can do it                                | CSS `transition` / `animation` / `@starting-style`                          |
| Need springs or gesture-driven animation          | External library (motion, GSAP)                                             |
| React component                                   | `useLoop` (same engine with React lifecycle management)                     |

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

- **Never call React `setState` inside `onTick`.** It fires 60 times/sec. Write to refs or DOM directly.
- **Never allocate inside `onTick`.** No objects, arrays, closures, template literals, or spreads. `FrameState` is mutated in place; reuse external variables.
- **Never store a reference to `frame`.** It's the same object every tick, mutated in place. Read values immediately.
- **Don't call `start()` after `stop()`.** `stop()` is terminal. Create a new loop instance.
- **Don't use `createLoop` without an element.** Throws `PhaseError` with code `no_element`.

## Reduced motion

Default: `'pause'`. The loop pauses entirely when reduced motion is enabled. The `phaseReason` will be `'reduced-motion'`.

- `'complete'`: Jump to the end state instantly (useful for tweens that have a target). The loop runs one final tick then stops.
- `'ignore'`: Keep running regardless. Use only for non-decorative motion (e.g. a data visualization that conveys information via movement).

## See also

- [createTicker](./create-ticker.md). The low-level rAF clock underneath createLoop; use when you don't need visibility management
- [createLifecycle](./create-lifecycle.md). The activation signal without the ticker; use when you own the render loop
- [useLoop](./use-loop.md). React hook wrapping createLoop with ref management
- [useCanvas](./use-canvas.md). React hook for canvas/WebGL with DPR handling on top of createLoop
- [abort-signals](./abort-signals.md). Stop this loop via the `signal` option

---

# `createMutation`

Lifecycle-aware MutationObserver that coalesces records into one rAF-batched callback. Never fires per-record synchronously. Auto-pauses when the observed element is off-screen via pooled IntersectionObserver.

## Signature

```ts
import { createMutation } from 'phase';

const mutation = createMutation(options: MutationOptions): Mutation;
```

### Options

| Option                | Type                                  | Default   | Description                                      |
| --------------------- | ------------------------------------- | --------- | ------------------------------------------------ |
| `element`             | `Element`                             | required  | Element to observe                               |
| `mutation`            | `MutationObserverInit`                | required  | Standard MutationObserver configuration          |
| `onMutations`         | `(records: MutationRecord[]) => void` | required  | Called once per rAF frame with coalesced records |
| `onPhaseChange`       | `(phase, reason) => void`             | --        | Called on phase transitions                      |
| `visibility`          | `'pause' \| 'ignore'`                 | `'pause'` | Pause observation when off-screen, or ignore     |
| `intersectionOptions` | `IntersectionObserverInit`            | --        | Forwarded to the visibility observer             |
| `signal`              | `AbortSignal`                         | --        | Stops the observer when aborted                  |

### Return (Mutation)

| Property      | Type             | Description                                       |
| ------------- | ---------------- | ------------------------------------------------- |
| `phase`       | `MutationPhase`  | `'observing' \| 'paused' \| 'stopped'`            |
| `phaseReason` | `MutationReason` | `'initial' \| 'started' \| 'sight' \| 'disposed'` |
| `stop()`      | `() => void`     | Disconnect and clean up                           |

### Phases

| Phase       | Meaning                                    |
| ----------- | ------------------------------------------ |
| `observing` | MutationObserver is connected and batching |
| `paused`    | Disconnected (off-screen or initial)       |
| `stopped`   | Permanently disposed                       |

### Reasons

| Reason     | Meaning                          |
| ---------- | -------------------------------- |
| `initial`  | Not yet started                  |
| `started`  | Element is visible, observing    |
| `sight`    | Paused because element is hidden |
| `disposed` | `stop()` or signal aborted       |

## When to use

- Reacting to DOM structure changes (`childList`) while the element is visible.
- Observing attribute changes on a narrow target without reflow storms.
- Coalescing frequent mutations (e.g., framework churn) into one batched read per frame.
- Replacing raw `new MutationObserver` calls that lack visibility pausing and rAF batching.

## When not to use

| Instead of this                             | Use                                          |
| ------------------------------------------- | -------------------------------------------- |
| Tracking element size changes               | `useSize` (ResizeObserver, async, no reflow) |
| Observing scroll position                   | `createScrollProgress`                       |
| Checking `style` or `class` changes broadly | Narrower signals (`useMediaQuery`, CSS vars) |
| React component                             | `useMutation` (manages refs and teardown)    |

## Do

- Observe `childList` for structural changes with visibility gating:
  ```ts
  const mutation = createMutation({
    element: list,
    mutation: { childList: true },
    onMutations: (records) => updateCount(records.length),
  });
  ```
- Observe specific attributes on a single element (not subtree):
  ```ts
  const mutation = createMutation({
    element: el,
    mutation: { attributes: true, attributeFilter: ['data-state'] },
    onMutations: (records) => syncState(records),
  });
  ```
- Use `visibility: 'ignore'` when the observer must run regardless of viewport position (rare, for document-level coordination).

## Don't

- **Don't observe `subtree` + `attributeFilter: ['style']` or `['class']`.** This fires on every descendant style/class change (animations, hovers, framework churn). A dev-mode warning fires when this shape is detected. Narrow the scope or use a different signal.
- **Don't read layout inside `onMutations`.** The callback runs in a rAF batch, but reading `getBoundingClientRect`, `offsetWidth`, `getComputedStyle` inside it still forces a synchronous reflow. Read from `useSize` or cached values instead.
- **Don't call `stop()` then expect to restart.** `stop()` is terminal. Create a new instance.
- **Don't use for visibility detection.** Use `createSight` (IntersectionObserver, pooled, async).

## Reduced motion

Not applicable. `createMutation` observes DOM changes, not animation. The visibility-pausing signal composes with the same IO pool used by animation primitives.

## See also

- [useMutation](./use-mutation.md). React hook wrapping createMutation
- [createSight](./create-sight.md). Visibility observation (IO-based)
- [performance](./performance.md). Forced-reflow rules that apply inside `onMutations`
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option

---

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
| `signal`     | `AbortSignal`                 | —        | Stops the observer when the signal is aborted                   |

### Return (ScrollProgress)

| Property | Type         | Description                                   |
| -------- | ------------ | --------------------------------------------- |
| `ratio`  | `number`     | Current intersection ratio (synchronous read) |
| `stop()` | `() => void` | Unobserve and cleanup                         |

## When to use

- Reveal/opacity effects based on how much of an element is visible.
- Progress indicators tied to element viewport coverage.
- Parallax-like effects driven by intersection ratio.

## When not to use

| Instead of this                                           | Use                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Continuous scroll-scrubbing (scroll position as progress) | `motion`'s `useScroll` or native `ScrollTimeline` API |
| Boolean visibility (in view or not)                       | `createSight`                                         |
| React component                                           | `useScrollProgress`                                   |

**Important limitation:** `intersectionRatio` plateaus for tall elements once they fill the viewport. This tracks visibility fraction, not scroll position. For scroll-driven animation of tall content, use `ScrollTimeline`.

## Do

- Use for reveal effects (fade in as element enters viewport):
  ```ts
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  };
  ```
- Multiple instances with the same `steps` share a single IntersectionObserver, so there is no performance penalty for many elements.
- Read `progress.ratio` synchronously when you need the current value outside the callback.

## Don't

- **Don't use for full scroll-scrubbing.** Ratio plateaus for tall elements. Use ScrollTimeline.
- **Don't set `steps` extremely high** (e.g. 1000). Creates that many thresholds. 20–50 is appropriate for smooth visual results.
- **Don't call `getBoundingClientRect()` as a workaround.** That forces a reflow. Trust the async IO callback.

## Reduced motion

`createScrollProgress` does not automatically handle reduced motion. It reports a ratio. If the consumer is using the ratio for decorative animation, they should check `prefersReducedMotion()` and skip the animation.

## See also

- [useScrollProgress](./use-scroll-progress.md). React hook wrapping createScrollProgress
- [createSight](./create-sight.md). Boolean visibility (visible/hidden) instead of ratio
- [prefers-reduced-motion](./prefers-reduced-motion.md). Check before animating with the ratio
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option

---

# `createSight`

Reports whether an element is visible right now. Combines `document.visibilitychange`, `pageshow` (bfcache restore), and pooled `IntersectionObserver` into a single phase.

## Signature

```ts
import { createSight } from 'phase';

const sight = createSight(options: SightOptions): Sight;
```

### Options

| Option                | Type                                               | Default  | Description                                   |
| --------------------- | -------------------------------------------------- | -------- | --------------------------------------------- |
| `element`             | `Element`                                          | required | Element to observe                            |
| `intersectionOptions` | `IntersectionObserverInit`                         | —        | Forwarded to pooled IO                        |
| `onPhaseChange`       | `(phase: SightPhase, reason: SightReason) => void` | —        | Called on visibility transitions              |
| `signal`              | `AbortSignal`                                      | —        | Stops the observer when the signal is aborted |

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

## When not to use

| Instead of this                               | Use                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| Gating an animation loop                      | `createLifecycle` (adds reduced-motion handling + manual pause) |
| React component that needs visibility boolean | `useSight`                                                      |
| Lazy-mount children on viewport entry         | `WhenVisible` component                                         |
| Intersection ratio (scroll progress)          | `createScrollProgress`                                          |

## Do

- Rely on observer pooling: 20 elements with the same `intersectionOptions` share one `IntersectionObserver` instance.
- Use `onPhaseChange` instead of polling `phase` — it fires only on transitions.
- Call `stop()` in cleanup to free the observer slot.

## Don't

- **Don't use for animations directly.** `createSight` doesn't know about reduced motion. For animation gating, use `createLifecycle` which composes sight + reduced motion.
- **Don't create raw `IntersectionObserver` instances.** Use `createSight` (or `createScrollProgress`) to benefit from the shared pool.
- **Don't call in SSR.** Throws `PhaseError` with code `server_context`.

## Reduced motion

`createSight` does not handle reduced motion. It reports pure visibility. If you need to gate an animation, use `createLifecycle` which folds in the reduced-motion signal.

## See also

- [createLifecycle](./create-lifecycle.md). Composes sight + reduced motion + manual pause
- [useSight](./use-sight.md). React hook wrapping createSight
- [createScrollProgress](./create-scroll-progress.md). Intersection ratio instead of boolean visibility
- [when-visible](./when-visible.md). React component for viewport-gated lazy mounting
- [abort-signals](./abort-signals.md). Tear down this observer via the `signal` option

---

# `createTicker`

The low-level rAF clock underneath `createLoop`. Use when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

## Signature

```ts
import { createTicker } from 'phase';

const ticker = createTicker(options: TickerOptions): Ticker;
```

### Options

| Option   | Type                          | Default      | Description                                 |
| -------- | ----------------------------- | ------------ | ------------------------------------------- |
| `fps`    | `number`                      | — (uncapped) | Cap frame rate                              |
| `onTick` | `(frame: FrameState) => void` | required     | Called every frame                          |
| `signal` | `AbortSignal`                 | —            | Stops the ticker when the signal is aborted |

### Return (Ticker)

| Property      | Type           | Description                                                     |
| ------------- | -------------- | --------------------------------------------------------------- |
| `start()`     | `() => void`   | Begin ticking                                                   |
| `stop()`      | `() => void`   | Terminal (cannot restart)                                       |
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

## When not to use

| Instead of this                 | Use                                                  |
| ------------------------------- | ---------------------------------------------------- |
| Animation tied to a DOM element | `createLoop` (adds visibility pausing automatically) |
| React component                 | `useLoop` (manages refs and teardown)                |
| Single numeric tween            | `useTween`                                           |

## Do

- Use `pause()` / `resume()` for intentional suspension (e.g. user pauses a game).
- Rely on the shared clock: all tickers read the same `performance.now()` per frame, so multiple animations stay in sync.
- Trust delta clamping: after a long pause, `frame.delta` is clamped to 40ms. No teleporting.

## Don't

- **Never call `start()` or `resume()` on a stopped ticker.** Throws `PhaseError` with code `ticker_stopped`. Create a new instance.
- **Never store a reference to `frame`.** Same object every tick, mutated in place.
- **Never allocate inside `onTick`.** Zero-allocation contract applies here too.
- **Don't use `createTicker` for DOM animations.** Without visibility management, your loop keeps burning CPU when off-screen. Use `createLoop`.

## Reduced motion

`createTicker` does NOT handle reduced motion. It has no element or visibility concept. If you need reduced-motion awareness, use `createLoop` or `createLifecycle` instead.

## See also

- [createLoop](./create-loop.md). Builds on createTicker with visibility + reduced motion + quality signals
- [useLoop](./use-loop.md). React hook wrapping createLoop
- [abort-signals](./abort-signals.md). Stop this ticker via the `signal` option

---

# Decision guide

How to choose between CSS-only, minimal JS, phase, or an external animation library.

## The ladder

Always prefer the cheapest tier. Moving up the ladder adds JS, runtime cost, and bundle weight, which is only justified when the lower tier genuinely cannot do the job.

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

`useTween` calls `setState` per frame, acceptable only when the render tree below it is small. If the animated value drives a large subtree, move to Tier 3 (`useLoop` with ref-based DOM writes).

Reduced motion: jumps to target instantly (value still arrives, animation skipped).

### Tier 3: phase primitives

Use when you need any of:

- Per-frame DOM manipulation (transforms, canvas draws, WebGL)
- Visibility-aware pausing (zero CPU off-screen)
- Lifecycle signals for an external renderer (three.js, Pixi, Web Worker)
- Mount/unmount transitions with exit animations
- Scroll-driven reveals, element sizing, or media-query reactivity

| Scenario                            | Primitive                                     |
| ----------------------------------- | --------------------------------------------- |
| DOM animation loop                  | `useLoop`                                     |
| Canvas/WebGL loop                   | `useCanvas`                                   |
| Signal for your own renderer        | `useLifecycle`                                |
| Mount/unmount with exit             | `Presence`, `usePresence`                     |
| Swap between states with exit→enter | `Swap`                                        |
| Lazy mount on viewport entry        | `WhenVisible`                                 |
| Lazy mount when the browser is idle | `WhenIdle`, `useIdle`                         |
| Prefetch / side effect when idle    | `useWhenIdle`                                 |
| Skip painting off-screen (keep DOM) | `Defer`                                       |
| Pause raw work inside a `Defer`     | `useRenderState`                              |
| Visibility ratio (reveal effects)   | `useScrollProgress`                           |
| Element dimensions                  | `useSize`, `useContainerQuery`                |
| Media query subscription            | `useMediaQuery`                               |
| Visibility boolean                  | `useSight`                                    |
| Timed multi-step animation sequence | `useLoop` (`fps: 1–2`, `frame.elapsed` steps) |

All phase primitives share:

- Zero per-frame allocations
- Automatic reduced-motion handling
- Pooled observers (IO/RO/MQL, no raw `new IntersectionObserver`)
- Clean teardown on unmount

### Rendering: when to render, not only when to animate

phase's rendering helpers apply the same lifecycle signals to _rendering_ work. Choose by how aggressively you can skip work and whether the content must exist for SSR:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Use when                                           |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

- **`Defer` is the safest default.** Children stay server-rendered and keep their reserved box (`contain-intrinsic-size: auto <est>`), so no layout shift. It defers rendering only, never hydration or mounting.
- **`WhenIdle` / `WhenVisible` save more** but their children are absent from SSR HTML. Reserve them for non-critical content.

For multi-signal rendering patterns (two-tier `Defer` + `WhenVisible`, idle-gated `lazy()`, gating raw loops with `useRenderState`, and what _not_ to compose), see [rendering-recipes.md](./rendering-recipes.md).

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

The logos pass through as `children`, server-rendered HTML that React never hydrates or re-renders. The client component is a thin wrapper that toggles a CSS class. Benefits:

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
- `setTimeout`/`setInterval` chains for multi-step animation sequences → `useLoop` with `fps: 1–2` and `frame.elapsed`-based step derivation (see [timed-sequences.md](./timed-sequences.md))

## When NOT to replace with phase

- CSS transitions that already work well. Leave them alone.
- Spring animations with interruption. Keep your spring library.
- Gesture-driven animations. Keep your gesture library.
- Server-side code that imports easing math. Use `phase/ease` (no browser APIs).

## Migrating from animation libraries

When converting from framer-motion (or similar), map patterns to the cheapest tier that works. Don't convert every `motion.div` to a phase primitive — many are CSS-only transitions that don't need JS at all.

| framer-motion pattern                                             | phase equivalent                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<AnimatePresence>` + `exit` prop                                 | `<Presence>` or `<Swap>` with CSS `@starting-style` + `data-[phase=exiting]`                              |
| `motion.div` with `initial`/`animate` (opacity, transform)        | CSS `transition` + `@starting-style` (Tier 1). No JS needed for enter/exit.                               |
| `animate()` with `delay` chains (do X, wait, do Y)                | `useLoop` with `fps: 1–2` and `frame.elapsed` thresholds (see [timed-sequences.md](./timed-sequences.md)) |
| `stagger` children                                                | `useLoop` with per-child elapsed-time offsets (see [timed-sequences.md](./timed-sequences.md))            |
| `useInView`                                                       | `useSight` (reactive phase) or `useLifecycle` (animation gating)                                          |
| `useScroll` (scroll-position scrubbing)                           | `useScrollProgress` for intersection ratio; native `ScrollTimeline` for position-based                    |
| `layout` animations (animating between measured positions)        | Keep framer-motion. Phase does not do layout animation.                                                   |
| Spring physics (`type: 'spring'`)                                 | Keep framer-motion. Phase does not do springs.                                                            |
| Gesture-driven (`drag`, `whileTap`)                               | Keep framer-motion or `@use-gesture`. Phase does not handle gestures.                                     |
| `useMotionValue` + `useTransform` (continuous computed animation) | `useLoop` with `onTick` for per-frame DOM writes, or `useScrollProgress` if scroll-driven                 |

### Reviewing phase code

After any phase work, ask: is it using phase to the best of its ability? Right tier, right primitive, right options, nothing missing? See [audit.md](./audit.md) for the review framework.

## Common mistakes

- **Recommending phase for a CSS-only animation.** If `@starting-style` + `transition` or a CSS `animation` handles the enter/exit, don't add JS. Phase is for when CSS genuinely can't do it.
- **Using `useLoop` when `useTween` is sufficient.** If you're animating one value into render output and the component is cheap, `useTween` has a smaller API surface and bundle. `useLoop` is for when you need ref-based DOM writes or many values.
- **Using `useLifecycle` expecting it to drive frames.** It only gives you an active/paused signal. It does not schedule `requestAnimationFrame`. Use `useLoop` or `useCanvas` when you want phase to drive the clock.
- **Forgetting that `createLoop` has no `pause()`/`resume()`.** It's signal-driven (visibility, reduced motion, quality). For manual control, use `createLifecycle` which exposes `pause()`/`resume()`, or use the React hook's `enabled` prop.
- **Reaching for an external library for enter/exit transitions.** `Presence`, `Swap`, and `WhenVisible` handle mount/unmount with CSS `@starting-style` + `transitionend`. You don't need a library for this.
- **Using `useScrollProgress` expecting continuous scroll-scrubbing.** It reports intersection ratio, which plateaus for tall elements. For scroll-position-driven animation, use `ScrollTimeline` or `motion`'s `useScroll`.
- **Using `useLifecycle` + `setTimeout`/`setInterval` to build timed animation sequences.** `useLifecycle` only provides visibility signals — it doesn't drive timing. The timers keep firing off-screen, restart from zero when scrolling back, and don't participate in phase's lifecycle. Use `useLoop` with `frame.elapsed` instead: elapsed time freezes during pause, so sequences resume where they left off. See [timed-sequences.md](./timed-sequences.md).
- **Using `createLoop` / `createTicker` / `createLifecycle` in React when the hook would work.** Prefer the hook equivalents (`useLoop`, `useCanvas`, `useLifecycle`) — they manage refs, teardown, and `enabled` automatically. Reach for core primitives only when the hook doesn't fit: custom hooks composed from multiple primitives, `AbortController`-based teardown, or imperative managers that own their lifecycle.

---

# `Defer`

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`. Runtime-free: no hooks, no observer, only a styled element. Children stay in the DOM and are server-rendered.

## Signature

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="...">
  <ArticleSection />
</Defer>;

<Defer as="li" estimatedHeight="80px">
  <ListItemContent />
</Defer>;
```

### Props

| Prop              | Type                                         | Default    | Description                                                 |
| ----------------- | -------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `as`              | `ElementType`                                | `'div'`    | HTML element to render (`'li'`, `'tr'`, `'section'`, etc.)  |
| `estimatedHeight` | `string`                                     | `'1000px'` | Reserved size before first paint (any CSS length)           |
| `ref`             | `Ref<HTMLElement>`                           | --         | Forward a ref (read render-skip state via `useRenderState`) |
| ...rest           | `Omit<HTMLAttributes<HTMLElement>, 'style'>` | --         | Standard HTML attributes except `style` (use `className`)   |

> **No `style` prop.** The render-skip styles (`content-visibility`, `contain-intrinsic-size`) are encapsulated so they can't be accidentally overridden. Style the wrapper with `className`.

> **Always requires a wrapper element.** `content-visibility` is a CSS property that applies to an element. `Defer` renders that element for you. Use the `as` prop to pick the tag so it fits your document structure. If you cannot wrap the target (e.g., a third-party component that does not forward refs), apply `content-visibility: auto` and `contain-intrinsic-size: auto <height>` as raw CSS on a parent element instead.

## When to use

- Large repeated lists (dozens or hundreds of rows) where each row has meaningful DOM cost. Use `as="li"` or `as="tr"` to match the list structure.
- Heavy DOM subtrees below the fold (complex nested layouts, large tables, rich text).
- Long-form content pages (articles, docs, feeds) where most sections are off-screen.
- You want to keep server-rendered HTML (SEO, deep links) while skipping render cost.

## When to skip it

`Defer` is not a blanket "wrap everything." Paint containment has constraints. Skip it when:

- The content has intentional overflow (box shadows, negative margins, tooltips, popover triggers, decorative bleeds that extend beyond the element boundary).
- The subtree is small or cheap to paint. A few simple elements do not benefit from `content-visibility`, and the containment constraints add complexity without meaningful savings.
- The element is above the fold or in the initial viewport. There is nothing to defer.
- Users rely on find-in-page (Cmd+F) to locate text in this content (Safari does not reliably search inside skipped subtrees).
- The content contains focusable elements that assistive technology needs to reach while off-screen.

The right default: include `Defer` where the rendering cost is real (large lists, complex trees), skip it where the containment constraints cause problems or the content is too simple to benefit.

## When not to use

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
- **Keep content that must be in the DOM** (SEO, in-page search, anchor links). `Defer` SSRs its children. The whole `phase/react` entry is a client boundary (`'use client'`), but server-component children passed into `Defer` still render on the server and stream through.
- **Use the `as` prop for semantic elements** when a wrapper `div` would break document structure:
  ```tsx
  <ul>
    {items.map((item) => (
      <Defer as="li" key={item.id} estimatedHeight="80px">
        <ItemContent item={item} />
      </Defer>
    ))}
  </ul>
  ```

## Don't

- **Don't expect it to defer hydration or mounting.** React still mounts and hydrates. It defers only the browser's rendering of off-screen content.
- **Don't assume animations inside stop.** Paint is skipped but JS keeps running. phase loops self-pause off-screen on their own; gate raw rAF/interval work with `useRenderState`.
- **Don't place overflowing content inside a `Defer`.** `content-visibility: auto` applies paint containment (per the CSS Containment spec), which clips all overflow to the element's padding edge. Box shadows, negative margins, tooltips, dropdowns, and any decorative bleed that extends outside the `Defer` boundary will be cut off. `overflow: visible` has no effect because paint containment overrides it. Move overflowing elements outside the `Defer`, or remove `Defer` from that container.
- **Don't rely on `useSize` or `useContainerQuery` inside a skipped subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside skipped `content-visibility: auto` subtrees. Size observations resume automatically when the element scrolls back into view, but any size changes that occurred while skipped are only delivered at that point. If you need to react to the skip/unskip transition itself, use `useRenderState`.
- **Don't mutate layout or unmount based on skip state.** That reintroduces the layout shift `contain-intrinsic-size` prevents.

## Safari caveats

- **Find-in-page (Cmd+F) may not find text inside skipped subtrees.** Safari's native search does not consistently scan content hidden by `content-visibility: auto`. Chrome and Firefox handle this correctly. If search is critical, disable `Defer` for that content or implement application-level search.
- **SVG `<text>` elements** inside a `Defer` may fail to paint in older Safari versions. This was fixed in WebKit (late 2024) but may not have shipped to all Safari releases.

## Does this affect layout or CLS?

No. `contain-intrinsic-size: auto <estimatedHeight>` reserves space before first paint, and the browser remembers the real size afterward. Content keeps its box whether painted or skipped, so nothing shifts on scroll. `Defer` defers rendering only, never layout reservation, DOM presence, or hydration.

## Reduced motion

Not applicable. `Defer` does not animate. It only toggles the browser's rendering of its subtree.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `Defer` with the other rendering helpers
- [when-visible](./when-visible.md). Gate mounting on viewport entry
- [when-idle](./when-idle.md). Gate mounting on browser idle
- [use-render-state](./use-render-state.md). React to a `Defer` subtree's render-skip state

---

# Easing and math (`phase/ease`)

Pure functions. No browser APIs, no side effects, no React. Safe in server components, build scripts, Web Workers, and tests.

## Import

```ts
import { lerp, clamp01, easeOutCubic, remap } from 'phase/ease';
```

Tree-shakeable. Unused functions are dead-code-eliminated.

## Easing functions

All take a progress value (0–1) and return a curved progress value (0–1). They don't know about time, pixels, or anything else. They reshape a number.

| Function                            | Character                                               |
| ----------------------------------- | ------------------------------------------------------- |
| `easeOutCubic(progress)`            | Fast start, smooth deceleration                         |
| `easeOutQuart(progress)`            | Sharper deceleration                                    |
| `easeOutBack(progress, overshoot?)` | Overshoots target, snaps back. Default overshoot ≈ 10%. |
| `easeInOutCubic(progress)`          | Symmetric S-curve                                       |
| `linear(progress)`                  | Identity (no easing)                                    |

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

## When not to use

| Instead of this                                           | Use                                               |
| --------------------------------------------------------- | ------------------------------------------------- |
| Animating a value into React render                       | `useTween` (manages the loop for you)             |
| CSS easing                                                | CSS `cubic-bezier()` or `linear()` (no JS needed) |
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

- **Don't call `easeOutBack` with extremely large overshoot.** Values > 5 can produce extreme over/undershoot. Default 1.70158 is intentional.
- **Don't allocate the `RemapOptions` object inside `onTick`.** Pre-allocate and mutate the `value` field.
- **Don't use easing as a substitute for spring physics.** Easing is time-based (fixed duration). Springs are velocity-aware (no fixed duration).

## Reduced motion

Easing functions are pure math and don't know about reduced motion. The consumer of the eased value is responsible for checking motion preferences (or using a phase primitive that checks automatically).

## See also

- [useTween](./use-tween.md). Single-value animation using these easing functions
- [useLoop](./use-loop.md). Per-frame loop where you'd use lerp/clamp01/easing manually
- [decision-guide](./decision-guide.md). When CSS easing is sufficient vs. JS

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

## When not to use

| Instead of this                         | Use                                                           |
| --------------------------------------- | ------------------------------------------------------------- |
| Preventing the error in the first place | Check the error code table above and avoid the trigger        |
| React error boundary                    | Standard React error boundary (`isPhaseError` helps classify) |

## Do

- Use `isPhaseError(err)` for type-narrowing in catch blocks.
- Log `err.code` in telemetry for structured error tracking.
- Read `err.fix` for actionable guidance.

## Don't

- **Don't catch and silently swallow PhaseErrors.** They indicate misconfiguration, not transient failures.
- **Don't wrap `onTick` in try/catch.** Defeats TurboFan optimization on the hot path.

## Reduced motion

Not applicable. Errors are not affected by motion preferences.

## See also

- [create-loop](./create-loop.md). Throws `server_context`, `no_element`
- [create-ticker](./create-ticker.md). Throws `server_context`, `ticker_stopped`
- [use-tween](./use-tween.md). Throws `invalid_duration`
- [swap](./swap.md). Throws `missing_context`

---

# Performance rules

Impact-ranked do's and don'ts for writing performant animation code with phase. These are not aspirations. They are tested invariants backed by `src/__tests__/perf.spec.ts`.

## Contents

- **Critical.** Zero per-frame allocations | Never setState in onTick | No forced reflows
- **High.** Strong pause | Reduced motion by default | Stable function references
- **Medium.** Frame-locked shared clock | Delta clamping | Observer pooling | Never drive layout from a MutationObserver | will-change lifecycle | No getBoundingClientRect for visibility
- **Low.** Don't store FrameState refs | No try/catch in onTick | No debug logging in hot path

## Critical (per-frame violations cause visible jank)

### Zero per-frame allocations

V8's garbage collector runs in stop-the-world bursts on the main thread. Every allocation inside `onTick` becomes GC pressure that directly causes dropped frames. Even small objects accumulate across 60 calls/sec and trigger collections mid-animation. `FrameState` is created once and mutated in place every frame. Your `onTick`/`draw` must match.

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

**Pragmatic exception:** writing a template literal to `el.style.transform` (as in the Do example above) is acceptable. You must produce a string to set a CSS property, and the browser immediately consumes it. The rule targets unnecessary intermediate allocations (objects, arrays, closures), not the unavoidable final string write to the DOM.

### Never `setState` inside `onTick` / `draw`

React's reconciler is designed for infrequent, batched updates, not 60Hz. Each `setState` schedules a full fiber tree walk, diffing, and DOM commit. At 60fps that's 60 reconciliations per second competing with your animation for the 16.6ms frame budget. The animation itself stalls while React diffs. Write to refs or DOM directly.

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

Layout-triggering APIs force the browser to synchronously compute layout before returning a value. Inside a 60fps loop, this means the browser performs a full style-recalc + layout pass _every single frame_ before your animation can proceed. This is the exact opposite of compositor-aligned animation. Never call these inside or near `onTick`:

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

The weak-pause pattern (schedule rAF + early return) still costs ~0.1ms per frame in scheduling overhead, and on mobile that accumulates across multiple paused loops sharing the thread, draining battery for zero visual output. phase uses `cancelAnimationFrame()` to stop scheduling entirely when paused. Zero callbacks fire, zero CPU consumed.

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
// Creates a new function every render (unnecessary; phase syncs via ref)
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

### Never drive layout from a `MutationObserver`

Never read layout inside a `MutationObserver` callback. The callback fires after the DOM has mutated but before the browser lays it out again, so any layout read forces a synchronous reflow to resolve the dirty layout, and it repeats on every callback:

- `getBoundingClientRect()`
- `offsetWidth`, `offsetHeight`
- `scrollWidth`, `scrollHeight`, `scrollTop`, `scrollLeft`
- `clientWidth`, `clientHeight`
- `getComputedStyle()`

Observing `attributes` (especially `attributeFilter: ['style']`) with `subtree: true` to react to size or position is the most expensive case. JS-driven animation libraries (motion, react-spring) rewrite inline styles every frame, so the observer reflows once per mutation per frame across the whole subtree.

**Don't:**

```ts
const mo = new MutationObserver(() => {
  const { scrollHeight, clientHeight } = el; // forced reflow, on every style mutation
  thumb.style.height = `${(clientHeight / scrollHeight) * trackH}px`;
});
mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['style'] });
```

**Do:** React to size with `ResizeObserver` (`useSize`) and to visibility with `IntersectionObserver` (`useSight`). Both are async, compositor-aligned, and never force reflow. Reach for `MutationObserver` only for structural changes (`childList`). If you must read layout in response, coalesce callbacks into one `requestAnimationFrame` and separate all reads from all writes.

```ts
const { ref, size } = useSize(); // async, compositor-aligned, no layout read
```

### `will-change` only while animating

`will-change` promotes an element to its own GPU compositing layer, consuming VRAM and preventing the browser from coalescing paint operations. Leaving it on permanently wastes GPU memory when the animation is paused or idle.

**Don't:**

```tsx
// Permanent GPU layer even when animation is paused or never visible
<div className="will-change-transform" />
```

**Do:** Toggle `will-change` based on animation state:

```tsx
<div className={shouldAnimate ? 'will-change-transform' : ''} />
```

For JS-driven animations via `useLoop`, the browser auto-promotes after the first few `style.transform` writes. You typically don't need `will-change` at all. It's primarily useful for CSS `animation` / `transition` where you want to signal the compositor before the animation starts.

### Don't use `getBoundingClientRect()` for initial visibility

A common temptation: "the hero is above the fold, I want animation to start immediately without waiting for IntersectionObserver." The IO callback fires at paint time, one frame (~16ms). For animations with multi-second intervals, that delay is imperceptible. The reflow cost of `getBoundingClientRect()` is real, especially on pages with complex layout.

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

## When not to use

| Instead of this                            | Use                                                             |
| ------------------------------------------ | --------------------------------------------------------------- |
| Reactive subscription to motion preference | `usePrefersReducedMotion()` (re-renders on change)              |
| Gating an animation loop                   | `createLoop` / `useLoop` — handles reduced motion automatically |
| Checking inside a React component          | The hooks handle it for you (no manual check needed)            |

## Do

- Use for conditional `import()` of heavy animation code.
- Use at module/app init level, outside React's render cycle.
- Trust that all phase hooks/primitives consult this signal automatically. You rarely need this directly.

## Don't

- **Don't poll it in a loop.** It reads from the shared MQL pool (cheap), but still don't call it per-frame.
- **Don't use it to skip reduced motion handling.** That's what `reducedMotion: 'ignore'` is for on the primitive options.
- **Don't assume it's reactive.** This is a point-in-time read. For reactivity, use `useMediaQuery`.

## Reduced motion

This IS the reduced motion primitive. All other phase exports delegate to it internally.

## See also

- [use-prefers-reduced-motion](./use-prefers-reduced-motion.md). Reactive boolean hook
- [use-media-query](./use-media-query.md). Reactive subscription for arbitrary queries
- [create-loop](./create-loop.md). Automatic reduced-motion handling via `reducedMotion` option
- [create-lifecycle](./create-lifecycle.md). Automatic reduced-motion handling

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

- Show/hide transitions where a wrapper `div` is acceptable.
- Modals, toasts, menus, dropdowns, and anything that mounts/unmounts.
- You want zero boilerplate (compared to `usePresence`).

## When not to use

| Instead of this               | Use                                           |
| ----------------------------- | --------------------------------------------- |
| Need custom element (not div) | `usePresence` hook (full control over markup) |
| Exit→enter between N states   | `<Swap>` (coordinated transitions)            |
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

- **Don't use for per-frame animation.** `Presence` is for mount/unmount transitions only.
- **Don't set `exitDuration` shorter than your CSS transition.** Causes mid-animation unmount.
- **Don't nest `<Presence>` inside another `<Presence>` for exit→enter.** Use `<Swap>` instead.

## Reduced motion

Default `'respect'`: enter animation skipped (`data-enter="animate"` not stamped), exit is instant (no `exiting` phase). Element still appears/disappears. Decoration is removed, not behavior.

## See also

- [usePresence](./use-presence.md). Hook for full control over markup
- [swap](./swap.md). Coordinated exit→enter
- [when-visible](./when-visible.md). Viewport-gated lazy mount

---

# Rendering recipes

How to compose `Defer`, `WhenVisible`, `WhenIdle`, `useIdle`, `useWhenIdle`, and `useRenderState` with each other, with `next/dynamic`, and with the rest of phase. Each recipe is a scenario, a minimal pattern, and when to reach for it.

For the single-helper decision (which one at all), see [decision-guide.md](./decision-guide.md). This file is about combining them.

> **Reserve space in the fallback (for `WhenVisible` / `WhenIdle`).** Their children are absent from the DOM until they mount, so a zero-height or mismatched `fallback` (or `loading` placeholder) shifts everything below the moment the real content appears. Render the fallback at the final content's height, such as a sized skeleton or fixed-height box. This is the most common way these two helpers introduce a loading problem, and every recipe below follows it.
>
> **`Defer` is different: no hard layout shift.** Its children stay in the DOM and the browser measures and paints them at their true size when they scroll in, so a wrong `estimatedHeight` does **not** shift content. It only affects scrollbar proportion and scroll-anchoring math until first render. Give a realistic estimate to keep the scrollbar steady, but an imperfect one is cosmetic, not a CLS bug.

## Choosing between `Defer`, `WhenVisible`, and `WhenIdle`

When more than one could work, decide in this order:

1. **Must the content be in the server HTML?** (SEO, deep links, no-JS) → `Defer`. It is the only one that keeps children server-rendered.
2. **Is the mount itself expensive?** (large subtree, heavy component) → `WhenVisible` (scroll-gated) or `WhenIdle` (idle-gated). `Defer` still mounts and hydrates. It only skips paint.
3. **Trigger: scroll or idle?** Near-viewport relevance → `WhenVisible`. Non-critical, "whenever there's spare time" → `WhenIdle`.

> `Defer` skips paint but still mounts and hydrates. `When*` skip the mount entirely but drop the content from SSR HTML. Pick by what you can afford to lose.

### phase helpers vs `next/dynamic`

They solve different halves of the problem and compose:

- **`next/dynamic` (or React `lazy()`) splits the _bundle_.** The component's JS lands in a separate chunk and can skip SSR (`ssr: false`). But the chunk still downloads as soon as the component mounts.
- **`WhenVisible` / `WhenIdle` gate the _mount_.** Nothing renders (and, with `lazy()`/`dynamic` inside, nothing downloads) until the element nears the viewport or the browser is idle.

Use `next/dynamic` alone when the component is below the fold but will almost certainly be needed (split the bytes, mount normally). Wrap it in `WhenVisible`/`WhenIdle` when you also want to defer the _download_ until it is likely needed. In Next.js apps, prefer `next/dynamic` over `lazy()`. It integrates with SSR and the loader.

## Recipe: two-tier (`Defer` outside, `WhenVisible` inside)

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

**Scenario:** a heavy, below-the-fold widget in a Next.js app. Defer both its bytes and its download until the viewport nears it.

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

**Scenario:** a non-critical, code-split widget that should load when the main thread is free, not gated on scroll.

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

**Why/when:** `useIdle` is the boolean form. Reach for it to gate part of a _render_ inline. Prefer `WhenIdle` when wrapping children, `useIdle` for an inline boolean, and `useWhenIdle` for a _side effect_ (next recipe).

## Recipe: prefetch a heavy chunk on idle with `useWhenIdle`

**Scenario:** a panel or route that will likely be opened soon. Warm its code-split chunk during idle so it opens instantly, without blocking first paint.

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

**Why/when:** `useWhenIdle` is the effect-shaped idle primitive. It runs a callback once, cancels on unmount, and always calls the latest closure. Use it for prefetch, cache warming, or any non-urgent `import()`. It replaces the common (and frequently leaky) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])`. `useWhenIdle` handles the cancel and the SSR guard for you. Reach for `useIdle` instead when you need to _render_ from the idle signal rather than run a side effect.

## Recipe: render helper around a phase loop

**Scenario:** a `useLoop`/`useCanvas` animation that lives below the fold.

```tsx
<WhenVisible rootMargin="200px">
  <ParticleCanvas /> {/* uses useCanvas internally */}
</WhenVisible>
```

**Why/when:** safe and recommended. phase loops self-pause off-screen via their own `createSight`, so wrapping them is purely about deferring the _mount_ cost, not pausing the loop. You do not need `useRenderState` here. The loop already stops when unseen.

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

**Why/when:** `content-visibility: auto` skips paint, not JavaScript. Raw loops keep burning CPU inside a `Defer`. `useRenderState` reports the browser's actual render-skip decision so you can pause them. You only need this for non-phase work; phase loops already self-pause. `useRenderState` only listens and never mutates layout, so the no-layout-shift guarantee holds.

## What not to compose

- **Don't wrap a `Defer` in a `WhenVisible`.** Redundant. `WhenVisible` already withholds the mount until near the viewport, so the `content-visibility` skip never applies. Pick one tier.
- **Don't reach for `useRenderState` around a phase loop.** `useLoop`/`useCanvas`/`useLifecycle` self-pause off-screen already. Adding it is dead weight.
- **Don't use `WhenIdle`/`WhenVisible` for SEO-critical content.** Their children are absent from SSR HTML. Use `Defer`.
- **Don't ship a zero-height or mismatched fallback.** Gating the mount only helps if the placeholder reserves the final size; otherwise you trade a render cost for a layout shift.
- **Don't rely on `useSize` or `useContainerQuery` inside a skipped `Defer` subtree.** The CSS Containment spec silences `ResizeObserver` callbacks while `content-visibility: auto` content is skipped. This is spec behavior across all browsers, not a bug. Size observations resume when the element scrolls back into view, but any changes that occurred while skipped are delivered only at that point. Use `useRenderState` to detect the skip/unskip transition if your code depends on it.

## See also

- [decision-guide.md](./decision-guide.md). Choosing a tier and the single-helper decision
- [defer.md](./defer.md). `content-visibility` wrapper
- [when-idle.md](./when-idle.md). Idle-gated mount + `whenIdle`
- [when-visible.md](./when-visible.md). Viewport-gated mount
- [use-render-state.md](./use-render-state.md). Render-skip signal for raw work

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

- First state appears instantly (CLS prevention, no enter animation on initial mount).
- Subsequent states animate via `@starting-style` after the previous state exits.
- Rapid changes (A→B→C during A's exit) skip intermediates and advance to the latest `active`.
- `<Swap.State>` outside `<Swap>` throws `PhaseError` with code `missing_context`.

## When to use

- Form→success transitions, step wizards, tab content switching.
- Anywhere you need coordinated exit→enter without overlap.
- When both old and new content should animate (exit old, then enter new).

## When not to use

| Instead of this                 | Use                                |
| ------------------------------- | ---------------------------------- |
| Show/hide (one thing)           | `<Presence>`                       |
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

- **Don't use `<Swap.State>` outside `<Swap>`.** Throws `PhaseError` with code `missing_context`.
- **Don't expect overlap.** `Swap` is sequential (exit completes, then enter starts). For crossfade, use two `<Presence>` components.
- **Don't change `id` values dynamically.** IDs are stable identifiers for states.

## Reduced motion

Automatic: enter animation skipped for the incoming state, exit is instant for the outgoing state. Both still swap. Decoration is removed, not behavior.

## See also

- [presence](./presence.md). Show/hide without coordination
- [usePresence](./use-presence.md). Hook for custom presence logic
- [when-visible](./when-visible.md). Viewport-gated (different concern)

---

# Timed sequence animations

How to build visibility-aware, multi-step animation sequences (do X, wait, do Y, wait, do Z) with phase. This is the most common marketing animation pattern and the one most likely to be built incorrectly.

## The anti-pattern

The wrong approach combines `useLifecycle` (for visibility) with `setTimeout`/`setInterval` (for timing):

```tsx
const { ref, isActive } = useLifecycle();
const [step, setStep] = useState(0);

useEffect(() => {
  if (!isActive) return;
  const t1 = setTimeout(() => setStep(1), 500);
  const t2 = setTimeout(() => setStep(2), 1200);
  const t3 = setTimeout(() => setStep(3), 2000);
  return () => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);
  };
}, [isActive]);
```

This fails in three ways:

1. **Timers restart from zero on re-entry.** Scroll away then back — the sequence replays from the beginning instead of resuming where it left off.
2. **Timers don't participate in phase's lifecycle.** If the cleanup races or `isActive` flips rapidly, timers can fire out of order or after unmount.
3. **Each step triggers a React re-render.** `setStep` causes reconciliation for what should be a DOM-only operation.

## The correct pattern: `useLoop` with `frame.elapsed`

Derive which animation step you're in from `frame.elapsed` thresholds. The loop auto-pauses off-screen, `elapsed` freezes during pause, and the sequence resumes exactly where it left off.

**Critical: set CSS initial state.** Elements must start in their pre-animation state via CSS. The loop doesn't fire its first tick until the element enters the viewport. Without an initial CSS state, the element renders at its natural size, then snaps to the animation start on the first tick — causing a visible flash (full width → zero → animate to full width). Set the initial state in CSS so there's nothing to flash:

```tsx
const { ref } = useLoop({
  fps: 2,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;

    const e = frame.elapsed;
    const bar1 = el.querySelector<HTMLElement>('[data-bar="1"]');
    const bar2 = el.querySelector<HTMLElement>('[data-bar="2"]');
    const bar3 = el.querySelector<HTMLElement>('[data-bar="3"]');
    if (!bar1 || !bar2 || !bar3) return;

    bar1.style.transform = `scaleX(${clamp01(e / 500)})`;
    bar2.style.transform = `scaleX(${clamp01((e - 500) / 700)})`;
    bar3.style.transform = `scaleX(${clamp01((e - 1200) / 800)})`;
  },
});

return (
  <div ref={ref}>
    {/* CSS initial state matches animation start (scaleX(0)) */}
    <div data-bar="1" className="origin-left scale-x-0" />
    <div data-bar="2" className="origin-left scale-x-0" />
    <div data-bar="3" className="origin-left scale-x-0" />
  </div>
);
```

### Why this works

- **CSS initial state prevents flash.** Elements start at `scaleX(0)` in CSS, so they're already in the animation start state before the loop fires its first tick. No visible snap on first entry.
- **`frame.elapsed` freezes during pause.** Scroll away, come back — the sequence picks up exactly where it stopped. No restart on re-entry.
- **`fps: 2` (or `fps: 1`) keeps CPU near zero.** Step transitions happen on second or half-second boundaries. You don't need 60fps to check which step you're in.
- **Zero re-renders.** `onTick` writes to the DOM directly via refs. React never reconciles.
- **Visibility-aware by default.** The loop pauses off-screen and under reduced motion. No manual `IntersectionObserver` needed.

## Step-by-step

1. **Identify the sequence steps.** Each step has a start time (ms from the beginning) and a duration.
2. **Set CSS initial state.** Each animated element's CSS must match its animation start state (e.g., `scaleX(0)`, `opacity: 0`, `translateY(20px)`). This prevents the flash between the browser's first paint and the loop's first tick.
3. **Use `useLoop` with a low `fps`.** `fps: 1` or `fps: 2` is enough for step-based sequences. Use higher FPS only if you need smooth interpolation between steps.
4. **Derive step state from `frame.elapsed` in `onTick`.** Compare against your timing thresholds. Write to DOM directly.
5. **Use `clamp01` for progress within each step.** `clamp01((elapsed - stepStart) / stepDuration)` gives you a 0–1 progress for each step.
6. **Apply easing if needed.** Pipe the clamped progress through an easing function: `easeOutCubic(clamp01((e - start) / duration))`.

## Variations

### Staggered reveal (multiple elements animate in sequence)

Set CSS initial state on each item (`opacity-0` + offset) so nothing flashes before the loop starts:

```tsx
const STAGGER_DELAY = 200;

const { ref } = useLoop({
  fps: 2,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]');
    for (let i = 0; i < items.length; i++) {
      const progress = clamp01((frame.elapsed - i * STAGGER_DELAY) / 600);
      const eased = easeOutCubic(progress);
      items[i].style.opacity = String(eased);
      items[i].style.transform = `translateY(${(1 - eased) * 20}px)`;
    }
  },
});

return (
  <div ref={ref}>
    {items.map((item, i) => (
      <div key={i} data-reveal className="opacity-0 translate-y-5">
        {item}
      </div>
    ))}
  </div>
);
```

### Finite sequence (stop after the last step)

Use `enabled` to stop the loop once the sequence is done:

```tsx
const [done, setDone] = useState(false);

const { ref } = useLoop({
  fps: 2,
  enabled: !done,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;

    const bar = el.querySelector<HTMLElement>('[data-bar]');
    if (!bar) return;

    const progress = clamp01(frame.elapsed / 1000);
    bar.style.transform = `scaleX(${easeOutCubic(progress)})`;

    if (progress >= 1) setDone(true);
  },
});

return (
  <div ref={ref}>
    {/* CSS initial state: bar starts at zero width */}
    <div data-bar className="origin-left scale-x-0" />
  </div>
);
```

`setDone(true)` fires once, not per frame. This is a phase transition (one re-render), not a hot-path allocation.

### CSS-only sequences that need lifecycle gating

If the sequence is pure CSS (`@keyframes` with `animation-delay`), use `useLifecycle` to toggle `animation-play-state` instead:

```tsx
const { ref, isActive } = useLifecycle();

return (
  <div ref={ref}>
    <div
      className={cn(
        'motion-safe:[animation-name:reveal-bar]',
        'motion-safe:[animation-fill-mode:forwards]',
        'motion-safe:[animation-delay:0s,0.5s,1.2s]',
        isActive
          ? 'motion-safe:[animation-play-state:running]'
          : 'motion-safe:[animation-play-state:paused]',
      )}
    />
  </div>
);
```

This is the right choice when CSS handles the timing and interpolation and you only need phase for visibility-aware pausing. No `setTimeout`, no JS timing.

## When to use each

| Timing driven by          | Use                                                   |
| ------------------------- | ----------------------------------------------------- |
| JS (`frame.elapsed`)      | `useLoop` with `fps: 1–2` and elapsed-time thresholds |
| CSS (`@keyframes`, delay) | `useLifecycle` toggling `animation-play-state`        |
| Neither (enter/exit only) | `Presence` / `WhenVisible` with CSS transitions       |

## See also

- [use-loop](./use-loop.md). The hook that drives the sequence
- [use-lifecycle](./use-lifecycle.md). For CSS-driven sequences that need visibility gating
- [ease](./ease.md). Easing functions for smooth step transitions
- [decision-guide](./decision-guide.md). Choosing between CSS, phase, and external libraries
- [performance](./performance.md). Rules for `onTick` (zero allocations, no setState)

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

| Option          | Type                                   | Default      | Description                                  |
| --------------- | -------------------------------------- | ------------ | -------------------------------------------- |
| `containerRef`  | `RefObject<Element \| null>`           | required     | Element that determines canvas size          |
| `canvasRef`     | `RefObject<HTMLCanvasElement \| null>` | required     | The `<canvas>` element                       |
| `draw`          | `CanvasDrawFn`                         | required     | Called every frame                           |
| `fps`           | `number`                               | —            | Cap frames per second                        |
| `enabled`       | `boolean`                              | `true`       | When `false`, tears down everything          |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'`    | `'pause'`    | Behavior under reduced motion                |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'`    | `'throttle'` | For heavy GPU work, `'pause'` is often right |
| `degradedFps`   | `number`                               | `30`         | FPS cap in degraded throttle mode            |

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

## When not to use

| Instead of this                        | Use                                   |
| -------------------------------------- | ------------------------------------- |
| DOM transforms (not canvas)            | `useLoop` (no canvas concerns)        |
| WebGL via three.js/Pixi (own renderer) | `useLifecycle` + your renderer's loop |
| Static canvas (draw once)              | One-shot `useEffect` with canvas API  |

## Do

- Cleanup is automatic. The effect teardown stops the loop, unobserves resize, and removes context-loss listeners on unmount.
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
- Extract `draw` to a named function using the exported `CanvasDrawFn` type: `const draw: CanvasDrawFn = (ctx, frame, size) => { ... }`.
- Draw in CSS pixels. `ctx` is already scaled for `devicePixelRatio`. DPR changes (e.g. dragging between monitors) are tracked reactively, including chained switches (A -> B -> C).
- Use `degraded: 'pause'` for heavy GPU work that can't gracefully degrade.
- Read `quality` to adapt rendering (fewer particles, simpler shaders).
- For 3D overlays on DOM elements, pair with `useSize({ box: 'border-box' })` for the target element's dimensions. Use a separate container for the canvas (the RO pool allows one observer per element, so sharing a ref between `useSize` and `useCanvas` would clobber one subscription). If you also need viewport-relative position (DOM-to-WebGL coordinate mapping), that requires `getBoundingClientRect()` on scroll/resize in a custom hook, since no async observer exists for element position:

  ```tsx
  const targetRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const { size } = useSize({ ref: targetRef, box: 'border-box' });
  useCanvas({ containerRef: canvasContainerRef, canvasRef, draw });
  ```

## Don't

- **Never call `setState` inside `draw`.** Same rule as `onTick`.
- **Never allocate inside `draw`.** Zero-allocation contract applies.
- **Don't call `canvas.getContext('2d')` yourself.** `useCanvas` manages the context.
- **Don't manually set `canvas.width`/`canvas.height`.** Handled by the resize system.
- **Don't use `getBoundingClientRect()` for sizing.** Uses ResizeObserver (async, no reflow).

## Reduced motion

Default `'pause'`: canvas stops rendering. Consider `'pause'` over `'complete'` for canvas since there's no single "end state" to jump to.

## See also

- [useLoop](./use-loop.md). DOM animation variant (no canvas concerns)
- [useLifecycle](./use-lifecycle.md). Use with three.js/Pixi where you own the renderer
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Reactive DPR for renderers outside `useCanvas`
- [createLoop](./create-loop.md). Framework-agnostic core

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

## When not to use

| Instead of this                        | Use                             |
| -------------------------------------- | ------------------------------- |
| Need actual dimensions (not a boolean) | `useSize`                       |
| Viewport-based media query             | `useMediaQuery`                 |
| CSS container queries are sufficient   | CSS `@container` (no JS needed) |

## Do

- Use for responsive component behavior:
  ```tsx
  const { ref, matches: isWide } = useContainerQuery({ minWidth: 600 });
  return <div ref={ref}>{isWide ? <WideLayout /> : <NarrowLayout />}</div>;
  ```
- Combine multiple breakpoints by calling `useContainerQuery` multiple times.

## Don't

- **Don't use when CSS `@container` queries can do the job.** Pure CSS is cheaper.
- **Don't set contradictory min/max values.** `matches` will always be `false`.
- **Don't expect updates inside a skipped `Defer` subtree.** Like `useSize`, this hook uses `ResizeObserver` internally. The CSS Containment spec silences RO callbacks while `content-visibility: auto` content is skipped. Observations resume when the element scrolls back into view.

## Reduced motion

Not applicable. Reports a boolean, not animation.

## See also

- [useSize](./use-size.md). Raw dimensions (re-renders on every change)
- [useMediaQuery](./use-media-query.md). Viewport/device media queries

---

# `useDevicePixelRatio`

Reactive `devicePixelRatio` that updates when the window moves between monitors with different pixel densities.

## Signature

```ts
import { useDevicePixelRatio } from 'phase/react';

const dpr: number = useDevicePixelRatio();
```

No parameters. Returns `1` during SSR and initial hydration, then the live value.

## When to use

- Sizing a WebGL/canvas buffer when you own the renderer (not using `useCanvas`):
  ```tsx
  const dpr = useDevicePixelRatio();
  const { ref, size } = useSize();
  useEffect(() => {
    if (!size) return;
    const bufferWidth = size.width * Math.min(dpr, 2);
    const bufferHeight = size.height * Math.min(dpr, 2);
    renderer.setSize(bufferWidth, bufferHeight);
  }, [dpr, size]);
  ```
- Sending pixel dimensions to a worker that renders off-thread.
- Applying a DPR cap for performance on high-density mobile displays.

## When not to use

| Instead of this                        | Use                                                      |
| -------------------------------------- | -------------------------------------------------------- |
| Canvas animation with DPR-aware sizing | `useCanvas` handles DPR, buffer sizing, and context loss |
| Reading element CSS dimensions         | `useSize` (DPR is irrelevant for layout)                 |

## Do

- Apply a performance cap when the consumer's workload is GPU-heavy:
  ```ts
  const effectiveDpr = Math.min(dpr, 2);
  ```
- Combine with `useSize` for buffer sizing. `useSize` gives CSS dimensions, `useDevicePixelRatio` gives the multiplier.

## Don't

- **Don't read `window.devicePixelRatio` directly in a component.** It's not reactive and goes stale when the window moves between monitors.
- **Don't use this with `useCanvas`.** `useCanvas` manages DPR internally, including degraded-quality fallback to DPR 1.

## Internals

Uses a shared `matchMedia('(resolution: Xdppx)')` subscription that re-subscribes on every DPR change, so chained monitor switches (A -> B -> C) are all caught. Multiple callers share one subscription.

## Reduced motion

Not applicable. `useDevicePixelRatio` reports a display property, not animation.

## See also

- [create-device-pixel-ratio](./create-device-pixel-ratio.md). Framework-agnostic core
- [use-canvas](./use-canvas.md). DPR-aware canvas with automatic buffer sizing
- [use-size](./use-size.md). CSS element dimensions via ResizeObserver
- [use-lifecycle](./use-lifecycle.md). Common pairing for WebGL/worker renderers that need DPR + lifecycle

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

## When not to use

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

- **Don't use for SSR-critical content.** Returns `false` on the server and the first client render, so idle-gated content is absent from server HTML.
- **Don't drive per-frame work off it.** It flips once and stays `true`; it is not a loop.

## Reduced motion

Not applicable. `useIdle` is a scheduling signal, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [rendering-recipes](./rendering-recipes.md). Sequencing work with `useIdle` and composing the rendering helpers
- [use-when-idle](./use-when-idle.md). The effect form, for side effects (prefetch, `import()`) once idle
- [when-idle](./when-idle.md). The mounting wrapper around `useIdle`
- [use-sight](./use-sight.md). Visibility-based gating instead of idle

---

# `useLifecycle`

The activation signal for loops you own. Wraps `createLifecycle` and returns `active` / `paused` so a consumer-owned render loop can pause when off-screen or under reduced motion.

## Signature

```ts
import { useLifecycle } from 'phase/react';

const { ref, phase, phaseReason, isActive } = useLifecycle<T>(options?);
```

### Options

| Option                | Type                       | Default   | Description                                                                                                           |
| --------------------- | -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`     | returned  | Bring your own ref                                                                                                    |
| `reducedMotion`       | `'pause' \| 'ignore'`      | `'pause'` | Whether reduced motion pauses the lifecycle                                                                           |
| `paused`              | `boolean`                  | `false`   | Manual pause (e.g. panel covers animation)                                                                            |
| `enabled`             | `boolean`                  | `true`    | When `false`, tears down and reports `idle`                                                                           |
| `intersectionOptions` | `IntersectionObserverInit` | —         | Forwarded to IO                                                                                                       |
| `onPhaseChange`       | `(phase, reason) => void`  | —         | Synchronous callback, fires before React render. Use for latency-sensitive work (posting to a worker, updating a ref) |

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

## When not to use

| Instead of this                            | Use                      |
| ------------------------------------------ | ------------------------ |
| You want phase to drive the loop           | `useLoop` or `useCanvas` |
| Just need visibility (no animation gating) | `useSight`               |
| Framework-agnostic code                    | `createLifecycle`        |

## Do

- Cleanup is automatic. The effect teardown calls `stop()` on unmount. No manual cleanup needed.
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
- Use `onPhaseChange` when you need synchronous notification (same frame as the observer callback), bypassing the React render cycle:

  ```tsx
  const { ref, isActive } = useLifecycle({
    onPhaseChange: (phase) => {
      worker.postMessage({ type: phase === 'active' ? 'resume' : 'pause' });
    },
  });
  ```

- Use as a thin RSC boundary for CSS animations with server-rendered content. Wrap `useLifecycle` in a named client component. The naming IS the documentation:

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

- **Don't use `useLifecycle` when `useLoop` would work.** If phase can drive the loop, let it (you get quality signals, frame budget tracking, and shared clock for free).
- **Don't combine `useLifecycle` with `setTimeout`/`setInterval` for animation sequencing.** The timers don't participate in phase's lifecycle — they keep running off-screen, restart from zero on re-entry, and race with cleanup. Use `useLoop` with `frame.elapsed`-based steps instead: elapsed time freezes during pause, so sequences resume where they left off. See [timed-sequences.md](./timed-sequences.md).
- **Don't set `paused` to implement visibility pausing.** That's automatic. Manual pause is for UI scenarios only.
- **Don't ship a generic `<Lifecycle>` component.** Unlike `Presence` (which has real transitionend/timeout logic), the lifecycle wrapper is 4 lines. Name it contextually and own those lines.

## Reduced motion

Default `'pause'`: `isActive` becomes `false`, `phaseReason` is `'reduced-motion'`. Your renderer should stop entirely. With `'ignore'`: lifecycle stays active regardless.

## See also

- [useLoop](./use-loop.md). Use when phase should drive the loop
- [useCanvas](./use-canvas.md). Use for canvas where phase drives the loop
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Reactive DPR for buffer sizing (common pairing)
- [useSight](./use-sight.md). Pure visibility, no animation gating
- [createLifecycle](./create-lifecycle.md). Framework-agnostic core

---

# `useLoop`

The primary React hook. Wraps `createLoop` with React lifecycle management. Visibility-aware animation loop that never triggers re-renders from the frame loop.

## Signature

```ts
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason, quality, qualityReason } = useLoop<T>(options);
```

### Options

| Option                | Type                                | Default      | Description                                        |
| --------------------- | ----------------------------------- | ------------ | -------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`              | returned     | Bring your own ref, or attach the returned one     |
| `onTick`              | `LoopTickFn`                        | required     | Called every frame (write to refs/DOM only)        |
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

## When not to use

| Instead of this                       | Use                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
| Canvas/WebGL animation                | `useCanvas` (adds DPR handling, resize, context loss recovery) |
| You own the renderer (three.js, Pixi) | `useLifecycle` (gives active/paused signal)                    |
| Single numeric value into render      | `useTween`                                                     |
| No React                              | `createLoop` (core)                                            |

## Do

- Cleanup is automatic. The effect teardown calls `stop()` on unmount. No manual cleanup needed.
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
- Extract `onTick` to a named function using the exported `LoopTickFn` type: `const tick: LoopTickFn = (frame) => { ... }`.

## Don't

- **Never call `setState` inside `onTick`.** Triggers 60 re-renders/sec. Write to refs or DOM.
- **Never allocate inside `onTick`.** No objects, arrays, closures, or spreads. Template literals for the final `style.*` write are acceptable (see [performance.md](./performance.md)).
- **Never store a reference to `frame`.** Same object mutated in place each tick.

## Reduced motion

Default `'pause'`: loop pauses, `phaseReason` is `'reduced-motion'`. Use `'complete'` for tweens that should jump to target. Use `'ignore'` only for non-decorative motion.

## See also

- [useCanvas](./use-canvas.md). Canvas/WebGL variant with DPR and resize handling
- [useLifecycle](./use-lifecycle.md). Activation signal for loops you own
- [createLoop](./create-loop.md). Framework-agnostic core
- [useTween](./use-tween.md). Single-value animation into React state

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

`boolean`. Whether the media query currently matches.

## When to use

- Subscribing to viewport-level or device-level media queries reactively.
- Dark mode detection: `useMediaQuery('(prefers-color-scheme: dark)')`.
- Reduced motion detection (reactive). Prefer `usePrefersReducedMotion()` for this specific case.
- Responsive logic that depends on viewport, not element size.

## When not to use

| Instead of this                     | Use                                                  |
| ----------------------------------- | ---------------------------------------------------- |
| Element-level breakpoint            | `useContainerQuery` or `useSize`                     |
| One-shot reduced motion check       | `prefersReducedMotion()` (synchronous, non-reactive) |
| Animation gating for reduced motion | `useLoop` / `useLifecycle` (handle it automatically) |
| CSS can do it                       | `@media` query in CSS (no JS needed)                 |

## Do

- Use for conditional rendering based on viewport:
  ```tsx
  const isMobile = useMediaQuery('(max-width: 768px)');
  return isMobile ? <MobileNav /> : <DesktopNav />;
  ```
- Multiple `useMediaQuery` calls with the same query share one `MediaQueryList` (pooled).

## Don't

- **Don't use for element-level responsiveness.** Media queries are viewport-scoped. Use `useContainerQuery`.
- **Don't rely on the initial `false`.** During SSR and hydration the value is `false`. Design fallback UI accordingly.

## Reduced motion

`useMediaQuery('(prefers-reduced-motion: reduce)')` is the reactive way to check reduced motion. But for animation primitives, you don't need this. All hooks handle it automatically.

## See also

- [useContainerQuery](./use-container-query.md). Element-level breakpoints
- [use-prefers-reduced-motion](./use-prefers-reduced-motion.md). Reactive reduced-motion boolean
- [prefers-reduced-motion](./prefers-reduced-motion.md). Synchronous one-shot check
- [useSize](./use-size.md). Raw element dimensions

---

# `useMutation`

React hook wrapping `createMutation`. Lifecycle-aware MutationObserver with rAF-coalesced callbacks. Auto-pauses when the element is off-screen, tears down on unmount.

## Signature

Two overloads. When `onPhaseChange` is provided, `phase` and `phaseReason` are omitted from the return type (compile-time error to access them).

```ts
import { useMutation } from 'phase/react';

// Reactive (re-renders on phase transitions)
const { ref, phase, phaseReason, phaseRef, phaseReasonRef } =
  useMutation<T>(options);

// Transient (zero re-renders)
const { ref, phaseRef, phaseReasonRef } = useMutation<T>({
  ...options,
  onPhaseChange: (phase, reason) => {
    /* imperative work */
  },
});
```

### Options

| Option                | Type                                  | Default   | Description                                                              |
| --------------------- | ------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `ref`                 | `RefObject<T \| null>`                | returned  | Bring your own ref, or attach the returned one                           |
| `mutation`            | `MutationObserverInit`                | required  | Standard MutationObserver configuration (must be stable across renders)  |
| `onMutations`         | `(records: MutationRecord[]) => void` | required  | Called once per rAF frame with coalesced records                         |
| `onPhaseChange`       | `(phase, reason) => void`             | --        | When provided, no re-renders occur on phase transitions (transient mode) |
| `visibility`          | `'pause' \| 'ignore'`                 | `'pause'` | Pause observation when off-screen, or ignore visibility                  |
| `enabled`             | `boolean`                             | `true`    | When `false`, tears down the observer entirely                           |
| `intersectionOptions` | `IntersectionObserverInit`            | --        | Forwarded to the visibility observer                                     |

### Return (reactive, no `onPhaseChange`)

| Property         | Type                        | Description                                              |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`      | Attach to the observed element                           |
| `phase`          | `MutationPhase`             | `'observing' \| 'paused' \| 'stopped'`                   |
| `phaseReason`    | `MutationReason`            | `'initial' \| 'started' \| 'sight' \| 'disposed'`        |
| `phaseRef`       | `RefObject<MutationPhase>`  | Phase via ref. Always current, never triggers re-render  |
| `phaseReasonRef` | `RefObject<MutationReason>` | Reason via ref. Always current, never triggers re-render |

### Return (transient, with `onPhaseChange`)

| Property         | Type                        | Description                                              |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`      | Attach to the observed element                           |
| `phaseRef`       | `RefObject<MutationPhase>`  | Phase via ref. Always current, never triggers re-render  |
| `phaseReasonRef` | `RefObject<MutationReason>` | Reason via ref. Always current, never triggers re-render |

`phase` and `phaseReason` are not available in transient mode. Accessing them is a TypeScript error.

## When to use

- Reacting to DOM changes (child additions, attribute mutations) inside a React component.
- Syncing external DOM state into your component without reflow storms.
- Replacing raw `MutationObserver` usage in `useEffect` that lacks visibility pausing and rAF batching.
- Coalescing frequent mutations from animation libraries or framework churn into one callback per frame.

## When not to use

| Instead of this                            | Use                                          |
| ------------------------------------------ | -------------------------------------------- |
| Tracking element dimensions                | `useSize` (ResizeObserver, async, no reflow) |
| Viewport visibility as a boolean           | `useSight`                                   |
| Observing `style`/`class` across a subtree | Narrower signals or `useMediaQuery`          |
| Framework-agnostic code                    | `createMutation` (core)                      |

## Do

- Cleanup is automatic. The effect teardown disconnects the observer on unmount.
- Observe structural changes:
  ```tsx
  const { ref } = useMutation({
    mutation: { childList: true },
    onMutations: (records) => {
      const added = records.filter((r) => r.addedNodes.length > 0);
      countRef.current += added.length;
    },
  });
  return <ul ref={ref}>{items}</ul>;
  ```
- Use `onPhaseChange` for zero-re-render observation:
  ```tsx
  const { ref, phaseRef } = useMutation({
    mutation: { childList: true },
    onMutations: handleRecords,
    onPhaseChange: (phase) => {
      worker.postMessage({ observing: phase === 'observing' });
    },
  });
  ```
- Read `phaseRef.current` inside callbacks for the latest phase without closure staleness.

## Don't

- **Don't read layout inside `onMutations`.** Reading `getBoundingClientRect`, `offsetWidth`, or `getComputedStyle` forces a synchronous reflow even inside the rAF batch. Use `useSize` for dimensions.
- **Don't observe `subtree` + `attributeFilter: ['style', 'class']`.** Fires on every descendant style/class change. A dev-mode warning fires for this pattern.
- **Don't pass an unstable `mutation` object.** Define it outside the component or memoize it. Changes to the object are not tracked and will not restart the observer.

## Reduced motion

Not applicable. `useMutation` observes DOM changes, not animation.

## See also

- [createMutation](./create-mutation.md). Framework-agnostic core
- [useSight](./use-sight.md). Visibility observation (different signal)
- [useSize](./use-size.md). Dimension tracking via ResizeObserver
- [performance](./performance.md). Forced-reflow rules for observer callbacks

---

# `usePrefersReducedMotion`

Reactive boolean that tracks the user's `prefers-reduced-motion` OS setting. Re-renders only when the preference changes.

## Signature

```ts
import { usePrefersReducedMotion } from 'phase/react';

const reduced: boolean = usePrefersReducedMotion();
```

No parameters. Returns `false` during SSR and initial hydration, then the live value.

## When to use

- Gating a non-phase animation (hover effect, burst rAF loop, Lottie) on reduced motion:

  ```tsx
  const reduced = usePrefersReducedMotion();

  const onHover = useCallback(() => {
    if (reduced) return;
    runBurstAnimation(ref.current);
  }, [reduced]);
  ```

- Conditionally rendering a static fallback instead of an animated component:
  ```tsx
  const reduced = usePrefersReducedMotion();
  return reduced ? <StaticHero /> : <AnimatedHero />;
  ```
- Skipping a dynamic `import()` of a heavy animation module:
  ```tsx
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    import('./confetti').then((m) => m.start());
  }, [reduced]);
  ```

## When not to use

| Instead of this                             | Use                                                              |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Gating `useLoop` / `useCanvas` / `Presence` | They handle reduced motion automatically via `reducedMotion` opt |
| One-shot check outside React (module init)  | `prefersReducedMotion()` (synchronous, non-reactive)             |
| Subscribing to an arbitrary CSS media query | `useMediaQuery(query)`                                           |

## Do

- Use for non-phase animations that need a reactive reduced-motion signal.
- Combine with `useCallback` so event handlers pick up preference changes without re-binding.

## Don't

- **Don't check this inside `onTick` / `draw`.** Phase hooks already pause under reduced motion. Hooks can't be called outside React components, and checking it per-frame is redundant anyway.
- **Don't duplicate the query string.** This hook exists so you never type `'(prefers-reduced-motion: reduce)'` manually.

## Reduced motion

This is a convenience wrapper around `useMediaQuery('(prefers-reduced-motion: reduce)')`. It uses the shared MQL pool, so multiple callers share one `MediaQueryList`.

## See also

- [prefers-reduced-motion](./prefers-reduced-motion.md). Synchronous one-shot check
- [use-media-query](./use-media-query.md). Arbitrary CSS media query subscription
- [use-loop](./use-loop.md). Automatic reduced-motion handling for animation loops

---

# `usePresence`

The hook behind `<Presence>`. Composable mount/unmount lifecycle with CSS transitions. Enter via `@starting-style`, exit coordinated by JS waiting for `transitionend`/`animationend`.

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

## When not to use

| Instead of this                       | Use                                       |
| ------------------------------------- | ----------------------------------------- |
| Show/hide with default div            | `<Presence>` component (less boilerplate) |
| Coordinated exit→enter between states | `<Swap>` component                        |
| Viewport-gated lazy mount             | `<WhenVisible>` component                 |

## Do

- Cleanup is automatic. Exit timers and event listeners are cleared on unmount.
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
- Always attach the `ref`. Needed for `transitionend`/`animationend` listening.
- Use `mode: 'reveal'` for SEO content or IO re-entry (stays in DOM, toggles visibility).

## Don't

- **Don't forget to attach `ref`.** Without it, exit animation has no element to listen on and relies on the safety timeout.
- **Don't set `exitDuration` too low.** If it's shorter than your CSS transition, the element unmounts mid-animation.
- **Don't use `usePresence` for per-frame animation.** It coordinates mount/unmount transitions only. Use `useLoop` for continuous animation.

## Reduced motion

Default `'respect'`: `enter` is `'instant'` (no `data-enter="animate"` stamped), exit is instant (no `exiting` phase, immediate unmount). Decorative animations are skipped. The element still appears and disappears.

## See also

- [presence](./presence.md). Declarative `<Presence>` component wrapping usePresence
- [swap](./swap.md). Coordinated exit→enter for multiple states
- [when-visible](./when-visible.md). Viewport-gated lazy mount

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
- Detect when `ResizeObserver` (`useSize`, `useContainerQuery`) stops and resumes delivering observations inside a `Defer` subtree. The CSS Containment spec silences RO callbacks while content is skipped; `useRenderState` reports that transition so you can respond to it.

## When not to use

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

---

# `useScrollProgress`

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management. Re-renders only at threshold crossings.

## Signature

Two overloads. When `onProgress` is provided, `progress` is omitted from the return type (compile-time error to access it).

```ts
import { useScrollProgress } from 'phase/react';

// Reactive (re-renders at threshold crossings)
const { ref, progress, progressRef } = useScrollProgress<T>(options?);

// Transient (zero re-renders)
const { ref, progressRef } = useScrollProgress<T>({
  onProgress: (p) => { el.style.opacity = String(p); },
});
```

### Options

| Option       | Type                         | Default  | Description                                                                                                  |
| ------------ | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `ref`        | `RefObject<T \| null>`       | returned | Bring your own ref                                                                                           |
| `steps`      | `number`                     | `20`     | Number of evenly-spaced thresholds                                                                           |
| `root`       | `Element \| null`            | —        | IO root element                                                                                              |
| `rootMargin` | `string`                     | —        | IO root margin                                                                                               |
| `onProgress` | `(progress: number) => void` | —        | Called on every threshold crossing. When provided, `progress` is omitted from the return type, no re-renders |

### Return (reactive, no `onProgress`)

| Property      | Type                   | Description                                                        |
| ------------- | ---------------------- | ------------------------------------------------------------------ |
| `ref`         | `RefObject<T \| null>` | Attach to the observed element                                     |
| `progress`    | `number`               | Fraction visible (0–1). `0` before first observation               |
| `progressRef` | `RefObject<number>`    | Fraction visible via ref. Always current, never triggers re-render |

### Return (transient, with `onProgress`)

| Property      | Type                   | Description                                                        |
| ------------- | ---------------------- | ------------------------------------------------------------------ |
| `ref`         | `RefObject<T \| null>` | Attach to the observed element                                     |
| `progressRef` | `RefObject<number>`    | Fraction visible via ref. Always current, never triggers re-render |

`progress` is not available in transient mode. Accessing it is a TypeScript error.

## When to use

- Reveal/opacity effects driven by how much of an element is visible.
- Progress indicators tied to viewport coverage.
- Parallax effects (clamped to element visibility, not scroll position).
- **With `onProgress`**: scroll-driven animation consumers that read progress imperatively without re-renders.

## When not to use

| Instead of this                       | Use                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| Continuous scroll-scrubbing           | `motion`'s `useScroll` or native `ScrollTimeline`                 |
| Boolean visibility                    | `useSight`                                                        |
| Per-frame DOM writes driven by scroll | `createScrollProgress` + `useLoop` (avoid setState per threshold) |

## Do

- Cleanup is automatic. The observer is unsubscribed on unmount.
- Use for declarative reveal effects:
  ```tsx
  const { ref, progress } = useScrollProgress();
  return (
    <div ref={ref} style={{ opacity: progress }}>
      {children}
    </div>
  );
  ```
- Use `onProgress` for zero-re-render scroll-driven animation:
  ```tsx
  const { ref, progressRef } = useScrollProgress({
    onProgress: (p) => {
      el.style.opacity = String(p);
    },
  });
  ```
- Read `progressRef.current` inside `onTick` callbacks for the latest ratio without closure staleness.
- Adjust `steps` for smoother or coarser updates (higher = more re-renders in reactive mode).

## Don't

- **Don't expect continuous values.** Updates only at threshold crossings (~20 per viewport traversal at default steps).
- **Don't use for tall elements expecting full 0→1 scroll.** Ratio plateaus once the element fills the viewport. Use `ScrollTimeline`.

## Reduced motion

`useScrollProgress` reports a ratio, not an animation, and does not handle reduced motion. If using the ratio for decorative animation, check `prefersReducedMotion()` or use `useLoop` which handles it.

## See also

- [createScrollProgress](./create-scroll-progress.md). Framework-agnostic core
- [useSight](./use-sight.md). Boolean visibility instead of ratio
- [useLoop](./use-loop.md). If you need per-frame writes, combine with createScrollProgress

---

# `useSight`

Element visibility as a phase (`visible` / `hidden`). Wraps `createSight` with React lifecycle management.

## Signature

Two overloads. When `onVisibilityChange` is provided, `phase` and `phaseReason` are omitted from the return type (compile-time error to access them).

```ts
import { useSight } from 'phase/react';

// Reactive (re-renders on visibility transitions)
const { ref, phase, phaseReason, phaseRef, phaseReasonRef } = useSight<T>(options?);

// Transient (zero re-renders)
const { ref, phaseRef, phaseReasonRef } = useSight<T>({
  onVisibilityChange: (phase, reason) => { /* imperative work */ },
});
```

### Options

| Option               | Type                                               | Default        | Description                                                                                            |
| -------------------- | -------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `ref`                | `RefObject<T \| null>`                             | returned       | Bring your own ref                                                                                     |
| `observe`            | `'continuous' \| 'once'`                           | `'continuous'` | `'once'` freezes at `'visible'` after first intersection                                               |
| `root`               | `Element \| null`                                  | —              | IO root element                                                                                        |
| `rootMargin`         | `string`                                           | —              | IO root margin                                                                                         |
| `threshold`          | `number \| number[]`                               | —              | IO threshold                                                                                           |
| `onVisibilityChange` | `(phase: SightPhase, reason: SightReason) => void` | —              | Called on every visibility transition. When provided, `phase`/`phaseReason` are omitted, no re-renders |

### Return (reactive, no `onVisibilityChange`)

| Property         | Type                     | Description                                                          |
| ---------------- | ------------------------ | -------------------------------------------------------------------- |
| `ref`            | `RefObject<T \| null>`   | Attach to the observed element                                       |
| `phase`          | `SightPhase`             | `'unknown' \| 'visible' \| 'hidden'`                                 |
| `phaseReason`    | `SightReason`            | `'initial' \| 'viewport' \| 'document' \| 'bfcache' \| 'all-hidden'` |
| `phaseRef`       | `RefObject<SightPhase>`  | Visibility phase via ref. Always current, never triggers re-render   |
| `phaseReasonRef` | `RefObject<SightReason>` | Phase reason via ref. Always current, never triggers re-render       |

### Return (transient, with `onVisibilityChange`)

| Property         | Type                     | Description                                                        |
| ---------------- | ------------------------ | ------------------------------------------------------------------ |
| `ref`            | `RefObject<T \| null>`   | Attach to the observed element                                     |
| `phaseRef`       | `RefObject<SightPhase>`  | Visibility phase via ref. Always current, never triggers re-render |
| `phaseReasonRef` | `RefObject<SightReason>` | Phase reason via ref. Always current, never triggers re-render     |

`phase` and `phaseReason` are not available in transient mode. Accessing them is a TypeScript error.

## When to use

- Lazy-mounting content on viewport entry (analytics, video playback, data loading).
- Tracking impressions.
- Conditionally rendering based on visibility (not animation gating; use `useLifecycle` for that).
- `observe: 'once'` for one-shot triggers (load data when first visible, never unload).
- **With `onVisibilityChange`**: observing many elements or gating imperative work without re-renders.

## When not to use

| Instead of this                                | Use                                                 |
| ---------------------------------------------- | --------------------------------------------------- |
| Gating an animation loop                       | `useLifecycle` (adds reduced motion + manual pause) |
| Viewport-gated lazy mount with enter animation | `WhenVisible` component                             |
| Intersection ratio (scroll progress)           | `useScrollProgress`                                 |

## Do

- Cleanup is automatic. The observer is disconnected on unmount.
- Use `observe: 'once'` for triggers that should never reverse:
  ```tsx
  const { ref, phase } = useSight({ observe: 'once' });
  if (phase === 'visible') loadData();
  ```
- Use `onVisibilityChange` for zero-re-render observation:
  ```tsx
  const { ref, phaseRef } = useSight({
    onVisibilityChange: (phase) => {
      worker.postMessage({ visible: phase === 'visible' });
    },
  });
  ```
- Read `phaseRef.current` inside callbacks for the latest visibility without closure staleness.
- Check `phaseReason` (or `phaseReasonRef`) to distinguish viewport leave from tab switch.

## Don't

- **Don't use for animation gating.** `useSight` doesn't know about reduced motion. Use `useLifecycle`.
- **Don't create raw `IntersectionObserver`.** `useSight` uses the pooled IO automatically.

## Reduced motion

Not applicable. `useSight` reports pure visibility. If using it to gate animation, switch to `useLifecycle`.

## See also

- [useLifecycle](./use-lifecycle.md). Visibility + reduced motion + manual pause for animation gating
- [when-visible](./when-visible.md). Declarative one-shot viewport lazy mount
- [useScrollProgress](./use-scroll-progress.md). Intersection ratio (0–1)
- [createSight](./create-sight.md). Framework-agnostic core

---

# `useSize`

Element dimensions via the shared ResizeObserver singleton. Never calls `getBoundingClientRect()`.

## Signature

Two overloads. When `onResize` is provided, `size` is omitted from the return type (compile-time error to access it).

```ts
import { useSize } from 'phase/react';

// Reactive (re-renders on resize)
const { ref, size, sizeRef } = useSize<T>(options?);

// Transient (zero re-renders)
const { ref, sizeRef } = useSize<T>({ onResize: (s) => applySize(s) });
```

### Options

| Option     | Type                            | Default         | Description                                                                                                  |
| ---------- | ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `ref`      | `RefObject<T \| null>`          | returned        | Bring your own ref                                                                                           |
| `box`      | `'content-box' \| 'border-box'` | `'content-box'` | Which CSS box model to measure. Controls both the observation trigger and which size is read from the entry. |
| `onResize` | `(size: Size) => void`          | —               | Called on every resize. When provided, `size` is omitted from the return type, no re-renders                 |

### Return (reactive, no `onResize`)

| Property  | Type                      | Description                                                 |
| --------- | ------------------------- | ----------------------------------------------------------- |
| `ref`     | `RefObject<T \| null>`    | Attach to the measured element                              |
| `size`    | `Size \| null`            | `{ width, height }` or `null` until first observation       |
| `sizeRef` | `RefObject<Size \| null>` | Always-current dimensions via ref. Never triggers re-render |

### Return (transient, with `onResize`)

| Property  | Type                      | Description                                                 |
| --------- | ------------------------- | ----------------------------------------------------------- |
| `ref`     | `RefObject<T \| null>`    | Attach to the measured element                              |
| `sizeRef` | `RefObject<Size \| null>` | Always-current dimensions via ref. Never triggers re-render |

`size` is not available in transient mode. Accessing it is a TypeScript error.

## When to use

- Reading element dimensions without forced reflows.
- Responsive logic based on actual element size (not viewport).
- Feeding dimensions to canvas sizing, layout calculations, or animations.
- Tracking full visual bounds (content + padding + border) for 3D overlays, coordinate mapping, or positioning with `box: 'border-box'`.
- **With `onResize`**: imperative consumers (canvas, WebGL, animation loops) that need size without re-renders.

## When not to use

| Instead of this                         | Use                                                     |
| --------------------------------------- | ------------------------------------------------------- |
| Breakpoint matching (only need boolean) | `useContainerQuery` (re-renders only on boundary cross) |
| Viewport size                           | CSS viewport units or `window.innerWidth`               |
| Canvas sizing                           | `useCanvas` (handles resize internally)                 |

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

- Use `box: 'border-box'` when you need the element's full painted bounds (content + padding + border), for example to overlay a canvas or 3D layer on a DOM element:

  ```tsx
  const { ref, size } = useSize({ box: 'border-box' });
  ```

- Use `onResize` for zero-re-render canvas/animation sizing:

  ```tsx
  const { ref, sizeRef } = useSize({
    onResize: (size) => {
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
    },
  });
  ```

- Read `sizeRef.current` inside `onTick`/`draw` callbacks for the latest dimensions without closure staleness.
- Re-renders only when dimensions actually change (deduped internally).
- `box` also controls the ResizeObserver trigger. With `'border-box'`, padding and border changes fire the callback even when content size is unchanged.

## Don't

- **Don't use `getBoundingClientRect()` as a fallback.** It forces a synchronous reflow. Trust the async RO callback.
- **Don't use when you only need a breakpoint boolean.** `useContainerQuery` re-renders less often.
- **Don't read `size` when `onResize` is provided.** The type omits it to prevent this, but the intent: in transient mode, read from `sizeRef` or use the callback value.
- **Don't use `useSize` for viewport-relative position tracking.** ResizeObserver reports dimensions, not coordinates. Mapping a DOM element into a WebGL/3D scene requires `getBoundingClientRect()` (a synchronous layout query) triggered on scroll or window resize. That's a controlled cost the consumer should own in a custom hook, not something phase wraps.
- **Don't expect updates inside a skipped `Defer` subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside `content-visibility: auto` subtrees that the browser has skipped. Size observations resume when the element scrolls back into view. This is spec behavior across all browsers, not a bug. If you need to detect the skip/unskip transition, use `useRenderState`.

## Reduced motion

Not applicable. `useSize` reports dimensions, not animation.

## See also

- [useContainerQuery](./use-container-query.md). Breakpoint matching (fewer re-renders)
- [useCanvas](./use-canvas.md). Canvas sizing handled automatically
- [useDevicePixelRatio](./use-device-pixel-ratio.md). Multiply CSS dimensions by DPR for buffer sizing
- [useScrollProgress](./use-scroll-progress.md). Visibility ratio, not dimensions

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

## When not to use

| Instead of this                   | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| Per-frame callback (onTick, draw) | `useSyncedRef` (phase hooks use it internally, no consumer action needed) |
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

- **Don't use for `onTick`/`draw`.** Phase hooks already sync these via `useSyncedRef` internally. Adding `useStableCallback` on top is redundant.
- **Don't use where React's `useCallback` with proper deps suffices.** Only reach for this when deps would be unstable or numerous.

## Reduced motion

Not applicable. Utility hook, no animation behavior.

## See also

- [useSyncedRef](./use-synced-ref.md). Ref-based value sync (used internally by phase hooks)
- [useLoop](./use-loop.md). Uses useSyncedRef for onTick automatically

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

## When not to use

| Instead of this                         | Use                                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| Stable-identity callback for props/deps | `useStableCallback` (returns a callable function, not a ref)   |
| DOM element ref                         | Standard `useRef` (`useSyncedRef` is for values, not elements) |

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

- **Don't use in deps arrays.** The ref object identity is stable, so it won't trigger re-runs. Read `.current` inside the effect body instead.
- **Don't use for state that should trigger re-renders.** Refs don't re-render. Use `useState` for reactive state.

## Reduced motion

Not applicable. Utility hook, no animation behavior.

## See also

- [useStableCallback](./use-stable-callback.md). Stable-identity function (callable, not a ref)
- [useLoop](./use-loop.md). Uses useSyncedRef internally for onTick

---

# `useTween`

Animates a number from its current position to `target` over a duration. Calls `setState` per frame, appropriate when the animated value is used in render output and the render is cheap.

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

## When not to use

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

- **Don't animate many values with separate `useTween` calls.** Each triggers a re-render per frame. Use `useLoop` for batch DOM animation.
- **Don't pass `duration: 0` or negative.** Throws `PhaseError` with code `invalid_duration`.
- **Don't use for canvas or WebGL.** `useTween` drives React state. Use `useCanvas`.

## Reduced motion

Default `'complete'`: jumps to target instantly. The value still arrives at its destination. The animation is skipped. This is the right default for tweens that must reach their final state.

## See also

- [useLoop](./use-loop.md). Per-frame DOM animation via refs (no re-renders)
- [ease](./ease.md). Easing functions used by useTween
- [useCanvas](./use-canvas.md). Canvas/WebGL animation

---

# `useWhenIdle`

Runs a callback once, when the browser is idle after mount. The effect-shaped counterpart to `useIdle`, for side effects (prefetching, cache warming, `import()`), not rendering. Cancels on unmount and always calls the latest callback.

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

## When not to use

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

- **Don't use it to gate rendering.** It returns nothing. Use `useIdle` for a boolean you render from.
- **Don't add cleanup yourself.** The hook cancels on unmount automatically. Hand-rolled `requestIdleCallback` in a `useEffect` commonly forgets `cancelIdleCallback` (a leak) and the SSR guard; `useWhenIdle` handles both.

## Reduced motion

Not applicable. `useWhenIdle` is a scheduling primitive, not an animation. Gate any motion you trigger from it with the usual reduced-motion handling.

## See also

- [use-idle](./use-idle.md). The boolean form, for rendering once idle
- [when-idle](./when-idle.md). Mount a subtree once idle
- [rendering-recipes](./rendering-recipes.md). Prefetching and composing the rendering helpers

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

| Option    | Type          | Default | Description                                      |
| --------- | ------------- | ------- | ------------------------------------------------ |
| `timeout` | `number`      | —       | Max ms to wait before running even if never idle |
| `signal`  | `AbortSignal` | —       | Cancels the scheduled callback when aborted      |

### Data attributes stamped (after idle)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Non-critical UI that should not compete with first paint (secondary panels, below-the-fold widgets, analytics).
- Work that must run eventually but not on the critical path (`whenIdle` for cache warming, prefetch).

## When not to use

| Instead of this                     | Use                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Content that must be in SSR HTML    | `Defer` (`WhenIdle` children are not server-rendered) |
| Mount when scrolled into view       | `WhenVisible`                                         |
| Critical content needed immediately | Render it directly. Don't defer.                      |

## Do

- **Render the `fallback` at the final content's height** to avoid layout shift when children mount:
  ```tsx
  <WhenIdle fallback={<Skeleton className="h-[320px]" />}>
    <Comments />
  </WhenIdle>
  ```
- **Set a `timeout`** when the work should not wait indefinitely on a busy main thread.

## Don't

- **Don't use for above-the-fold or SEO-critical content.** Idle never fires during SSR, so children are absent from server HTML.
- **Don't expect unmount.** Like `WhenVisible`, it is one-shot.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts. Only the enter animation is skipped.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `WhenIdle` with `lazy()`, `Suspense`, and the other helpers
- [when-visible](./when-visible.md). Gate mounting on viewport entry
- [defer](./defer.md). Keep content in the DOM but skip painting
- [use-idle](./use-idle.md). The boolean hook behind `WhenIdle`
- [use-when-idle](./use-when-idle.md). Run a side effect (prefetch, `import()`) once idle
- [abort-signals](./abort-signals.md). Cancel the `whenIdle` callback via the `signal` option

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

| Prop         | Type                    | Default   | Description                                                                                                    |
| ------------ | ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `rootMargin` | `string`                | `'200px'` | IO rootMargin (preload headroom)                                                                               |
| `threshold`  | `number \| number[]`    | —         | IO threshold                                                                                                   |
| `root`       | `Element \| null`       | —         | IO root element                                                                                                |
| `fallback`   | `ReactNode`             | —         | Shown while awaiting intersection                                                                              |
| `ref`        | `Ref<HTMLDivElement>`   | —         | Forwarded to the rendered div in both states (sentinel before visible, entered div after). Populated at mount. |
| ...rest      | `ComponentProps<'div'>` | —         | All standard div props                                                                                         |

### Data attributes stamped (after visible)

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Always (after mount)                                           |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Viewport-gated lazy loading (heavy charts, images, interactive widgets).
- Code-split components that should only load when scrolled into view.
- Scroll-triggered reveal animations (fade in on enter).

## When not to use

| Instead of this             | Use                                             |
| --------------------------- | ----------------------------------------------- |
| Show/hide that can reverse  | `<Presence>` with `mode: 'reveal'`              |
| Need exit animation         | `<Presence>` (WhenVisible is one-shot, no exit) |
| Boolean visibility tracking | `useSight` (for observation without mounting)   |

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

- **Don't expect it to unmount when scrolled away.** It's one-shot. Once visible, stays mounted.
- **Don't use for exit animations.** `WhenVisible` has no exit phase. Use `<Presence>`.
- **Don't set `rootMargin: '0px'`** unless you want no preloading headroom.
- **Don't ship a zero-height `fallback`.** A mismatched placeholder height causes layout shift on mount.

## Ref forwarding

A forwarded `ref` is attached to whichever div is currently rendered: the sentinel before intersection, the entered div after. `ref.current` is populated at mount — safe to read for measurement or to attach a listener to an ancestor via `.closest()` without waiting for visibility. Both nodes live inside the same subtree, so ancestor lookups resolve identically in either state.

## Reduced motion

Automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion. Content still mounts. The enter animation is skipped.

## See also

- [rendering-recipes](./rendering-recipes.md). Two-tier `Defer` + `WhenVisible` and other compositions
- [presence](./presence.md). Show/hide with exit animation
- [useSight](./use-sight.md). Boolean visibility without mounting
- [swap](./swap.md). Coordinated state transitions
