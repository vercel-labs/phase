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

## Step 1.5: CSS, loading, and architecture pass

After the JS scan, check for non-JS anti-patterns. The scanner covers some of these automatically; others require manual inspection.

### CSS/DOM-scale checks

- **Global `:has()` selectors.** Search `.css`/`.scss` files for `body:has(` or `html:has(`. Each forces document-wide has-invalidation on every DOM mutation.
- **Missing `content-visibility`.** Large repeated lists (`.map()` returning many items) without `content-visibility: auto` or `Defer` pay full off-screen style/layout cost.
- **Permanent `will-change`.** CSS with `will-change: transform` that is never toggled wastes GPU memory when idle.

### Loading checks

- **Heavy static imports in always-mounted subtrees.** Look for top-level imports of heavy packages (markdown renderers, syntax highlighters, animation libraries) in components that mount on every route.
- **`display:none` as a close mechanism.** Components that hide with `display:none` or `visibility:hidden` instead of unmounting keep all JS/observers/subscriptions running.

### Architecture checks

- **Redundant observers.** Multiple `new MutationObserver` calls targeting `<html>` or `document.documentElement` in the same codebase, each firing on class changes.
- **Bare window listeners with layout reads.** Multiple components each attaching `addEventListener('resize', ...)` or `addEventListener('scroll', ...)` with `getBoundingClientRect` or `offset*` reads in the handler.

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

### When NOT to run the audit

Skip the scan when the codebase:

- Uses only CSS transitions/animations with no JS animation code
- Has no raw observer usage (no `new IntersectionObserver/ResizeObserver/MutationObserver`)
- Has already been audited and the scanner confirms zero candidates

### Severity weighting

When the scan returns many candidates, prioritize by impact:

1. **Forced reflows in hot paths** (observer callbacks, event handlers, rAF) cause visible jank. Fix first.
2. **Always-on background work** (rAF without visibility pausing, MO subtree storms) wastes CPU and battery. Fix second.
3. **Redundant observers** and **missing pooling** leak resources over time. Fix third.
4. **Dedup opportunities** (manual synced refs) are correct code with a phase shorthand. Fix last or never.

When in doubt, measure frame time before and after. An audit without measurement is speculation.

## Common replacements

| Current pattern                                                      | Replace with                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | `useLoop` (if DOM) or `useCanvas` (if canvas)                            |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same, plus the cleanup is now automatic                                  |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                             |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                                      |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                                |
| Raw `MutationObserver` with reflow reads in callback                 | `useMutation` (rAF-batched, visibility-aware)                            |
| `MutationObserver` on `style`/`attributes` to track size or position | `useSize` (ResizeObserver) / `useSight` (IO); reserve MO for `childList` |
| Multiple `MutationObserver` on `<html>` for class changes            | Single `useMutation` with coalesced callback                             |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)              |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                               |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                          |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                             |
| `getBoundingClientRect()` in `pointermove` handler                   | rAF-batched read (one `getBoundingClientRect` per frame, not per event)  |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                            |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                              |
| CSS-only animation that's working fine                               | No change. Don't add JS where it's not needed.                           |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` (single hook, same signals, pooled IO)                    |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`                  |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops             |
| `setInterval` rotation with visibility gating                        | CSS `@keyframes` + `useLifecycle` toggling `animation-play-state`        |
| `useRef(v)` + unconditional `ref.current = v` on every render        | `useSyncedRef(v)` (dedup, the raw pattern is correct, only verbose)      |
| Heavy panel always mounted with `display:none`                       | Conditional rendering + `Presence` + `useWhenIdle` prefetch              |
| N components with bare `window.addEventListener('resize', ...)`      | `useSize` or `useMediaQuery` (pooled observers, no raw listeners)        |
| Global `body:has(...)` in stylesheet                                 | Scope with a subtree-scoped `<style>` or data-attribute pattern          |
| Large list without `content-visibility`                              | `Defer` with `as` prop for semantic elements                             |

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical.** Causes jank or accessibility failures
2. **High.** Wastes significant CPU or leaks resources
3. **Medium.** Suboptimal but functional
4. **No change.** Already well-implemented (list briefly for completeness)

End with a summary: "Found N candidates, M actionable, K already optimal."
