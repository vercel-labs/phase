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

The scanner greps for these anti-pattern signals. Signals marked **(CSS)** run only on `.css`/`.scss` files; the rest run on `.ts`/`.tsx`/`.js`/`.jsx`.

| Signal                             | Pattern                                                                                                             | Why it's a problem                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Manual rAF loop                    | `requestAnimationFrame`                                                                                             | No visibility pausing, no shared clock, no cleanup               |
| `setState` in rAF                  | `requestAnimationFrame` with a nearby `setState`/`dispatch`/`setX(`                                                 | 60 re-renders/sec                                                |
| Forced reflow                      | `getBoundingClientRect`, `offsetWidth/Height`, `getComputedStyle`, `scroll*`, `client*`                             | Synchronous layout thrashing                                     |
| Raw IntersectionObserver           | `new IntersectionObserver`                                                                                          | Missing pooling, manual cleanup                                  |
| Raw ResizeObserver                 | `new ResizeObserver`                                                                                                | Missing pooling, manual cleanup                                  |
| MutationObserver → layout          | `new MutationObserver` watching `attributes`/`style` or reading layout nearby                                       | Forces synchronous reflow on every mutation                      |
| Redundant MutationObserver         | `new MutationObserver` on `document.documentElement`/`<html>`                                                       | Coalesce N observers on one target into one `useMutation`        |
| JS-driven opacity/transform        | `style.opacity =` or `style.transform =`                                                                            | Could be CSS, or needs phase for lifecycle                       |
| Missing reduced motion             | JS animation (`requestAnimationFrame`/`@keyframes`/`animation:`) without `prefers-reduced-motion` or a phase import | Accessibility gap                                                |
| Background animation               | `setInterval`/`setTimeout` near `transform`/`opacity`/`translate`/`animate`                                         | Wastes CPU off-screen                                            |
| Bare window listener               | `addEventListener('resize'`\|`'scroll')` with a layout read in the handler                                          | N unpooled listeners, a synchronous reflow per event             |
| Global `:has()` **(CSS)**          | `body:has(`, `html:has(`, `:root:has(`, `*:has(`                                                                    | Broad style invalidation; cost scales with the argument selector |
| Non-compositor animation **(CSS)** | `transition: all`, or a transition of `width`/`height`/`top`/`left`/`margin`                                        | Layout + paint every frame, off the compositor                   |
| Permanent `will-change` **(CSS)**  | `will-change: transform` not toggled with animation state                                                           | Wastes GPU memory when idle                                      |

> The `will-change` signal matches CSS syntax only. The Tailwind `will-change-transform` utility class (in `.tsx`) is a **manual** check. `getBoundingClientRect()` used only for an initial in-view check, and hand-wired "IO + visibilitychange + reduced motion → boolean" gates, are also manual heuristics; see [Common replacements](#common-replacements).

The scanner also emits one **dedup** signal, reported separately from the anti-patterns above because it flags correct code, not a defect:

| Signal (dedup)    | Pattern                                                                                                     | Note                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Manual synced ref | `const xRef = useRef(v)` immediately followed by an unconditional `xRef.current = v` mirroring the same `v` | This is the correct React latest-ref idiom; `useSyncedRef` is just a one-line shorthand. Optional cleanup, never a defect. |

Output is a list of candidate sites: `file:line` with the matched pattern. Dedup findings are listed after the anti-patterns and excluded from the actionable count.

If `scan.mjs` is not available (e.g. the skill is loaded without scripts), perform the scan manually by searching for the patterns above in the target codebase.

## Step 1.5: CSS, loading, and architecture pass

Run this alongside the JS scan, before classifying. The scanner automates the CSS/architecture signals marked below; the rest are manual inspection.

### CSS/DOM-scale checks

- **Non-compositor animation** (scanner: `non-compositor-animation`, CSS). `transition: all` or transitioning layout properties (`width`/`height`/`top`/`left`/`margin`) animates off the compositor: layout and paint every frame. The Tailwind `transition-all` class in JSX is a manual check. Prefer `transform`/`opacity`.
- **Global `:has()` selectors** (scanner: `global-has-selector`). `body:has(...)`, `html:has(...)`, `:root:has(...)`, or `*:has(...)` in a global stylesheet can trigger broad style invalidation; cost scales with the argument selector and subtree size. Scope the rule to a subtree or replace with a data attribute.
- **Missing `content-visibility`** (manual). Large repeated lists (`.map()` returning many items) without `content-visibility: auto` or `Defer` pay full off-screen style/layout cost.
- **Permanent `will-change`** (scanner: `permanent-will-change`, CSS only). CSS `will-change: transform` that is never toggled wastes GPU memory when idle. The Tailwind `will-change-transform` class in JSX is a manual check.

### Loading checks (manual)

- **Heavy static imports in always-mounted subtrees.** Top-level imports of heavy packages (markdown renderers, syntax highlighters, animation libraries) in components that mount on every route.
- **`display:none` as a close mechanism.** Components hidden with `display:none`/`visibility:hidden` instead of unmounting keep all JS, observers, and subscriptions running.

### Architecture checks

- **Redundant observers** (scanner: `redundant-mutation-observers`). Multiple `new MutationObserver` calls targeting `<html>`/`document.documentElement`, each firing on class changes; coalesce into one `useMutation`.
- **Bare window listeners with layout reads** (scanner: `bare-window-listener`). Components attaching `addEventListener('resize'|'scroll', ...)` with `getBoundingClientRect`/`offset*` reads in the handler. Replace size reads with pooled `useSize`/`useMediaQuery`, and scroll-position reads (`scrollLeft`/`scrollWidth`) with `useScroll`.

### Classification ladders

In addition to the animation ladder (`CSS → useTween → phase → external library`), classify loading and containment candidates:

**Loading ladder** (prefer the cheapest tier):

```
Static import  →  next/dynamic  →  WhenVisible + dynamic  →  useWhenIdle prefetch
```

**Containment ladder** (prefer the cheapest tier):

```
CSS content-visibility  →  Defer  →  WhenVisible / WhenIdle  →  conditional unmount
```

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

## When NOT to run the audit

Skip the scan when the codebase:

- Uses only CSS transitions/animations with no JS animation code
- Has no raw observer usage (no `new IntersectionObserver/ResizeObserver/MutationObserver`)
- Has already been audited and the scanner confirms zero candidates

## Severity weighting

When the scan returns many candidates, prioritize by impact:

1. **Forced reflows in hot paths** (observer callbacks, event handlers, rAF) cause visible jank. Fix first.
2. **Always-on background work** (rAF without visibility pausing, MO subtree storms) wastes CPU and battery. Fix second.
3. **Redundant observers** and **missing pooling** leak resources over time. Fix third.
4. **Dedup opportunities** (manual synced refs) are correct code with a phase shorthand. Fix last or never.

When in doubt, measure frame time before and after. An audit without measurement is speculation.

## Common replacements

| Current pattern                                                      | Replace with                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | `useLoop` (if DOM) or `useCanvas` (if canvas)                                                                                                                                                         |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same, plus the cleanup is now automatic                                                                                                                                                               |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                                                                                                                                                          |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                                                                                                                                                                   |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                                                                                                                                                             |
| Raw `MutationObserver` with reflow reads in callback                 | `useMutation` (rAF-batched, visibility-aware)                                                                                                                                                         |
| `MutationObserver` on `style`/`attributes` to track size or position | `useSize` (ResizeObserver) / `useSight` (IO); reserve MO for `childList`                                                                                                                              |
| Multiple `MutationObserver` on `<html>` for class changes            | Single `useMutation` with coalesced callback                                                                                                                                                          |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)                                                                                                                                           |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                                                                                                                                                            |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                                                                                                                                                       |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                                                                                                                                                          |
| `getBoundingClientRect()` in a `pointermove` handler                 | `usePointer` (one rAF-batched `getBoundingClientRect` per frame, not per event)                                                                                                                       |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                                                                                                                                                         |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                                                                                                                                                           |
| CSS-only animation that's working fine                               | No change. Don't add JS where it's not needed.                                                                                                                                                        |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` (single hook, same signals, pooled IO)                                                                                                                                                 |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`                                                                                                                                               |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops                                                                                                                                          |
| `setTimeout`/`setInterval` for timed animation sequences             | `useLoop` with `fps: 1–2` and `frame.elapsed`-based steps (see [timed-sequences.md](./timed-sequences.md)); or CSS `@keyframes` + `useLifecycle` toggling `animation-play-state` if purely CSS-driven |
| `useRef(v)` + unconditional `ref.current = v` on every render        | `useSyncedRef(v)` (dedup, the raw pattern is correct, only verbose)                                                                                                                                   |
| Heavy panel always mounted with `display:none`                       | Conditional rendering + `Presence` + `useWhenIdle` prefetch                                                                                                                                           |
| N components with bare `window.addEventListener('resize', ...)`      | `useSize` or `useMediaQuery` (pooled observers, no raw listeners)                                                                                                                                     |
| `scroll` handler reading `scrollWidth`/`clientWidth`                 | `useScroll` (rAF-batched offset + progress; geometry cached, read only on resize, not per event)                                                                                                      |
| Global `body:has(...)` in stylesheet                                 | Scope with a subtree-scoped `<style>` or data-attribute pattern                                                                                                                                       |
| Large list without `content-visibility`                              | `Defer` with `as` prop for semantic elements                                                                                                                                                          |

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
