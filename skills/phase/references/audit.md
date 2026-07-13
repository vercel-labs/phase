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

## Verification checklist

Run after any phase work — new implementation, migration, refactor, or review. Two parts: a holistic review (is the code using phase optimally?) followed by specific gotcha checks.

### Optimal usage review

For each animation or rendering concern in the code, walk through these questions. The goal is to verify that every usage is at the cheapest tier, with the right primitive, and the right options.

1. **Right tier?** Re-read the [decision guide ladder](./decision-guide.md). Could CSS handle this without JS (`transition`, `@starting-style`, `animation`)? Could `useTween` replace a `useLoop` that only animates one value into render? Is phase being used where an external library is genuinely needed (springs, gestures, layout animation)? The cheapest working tier always wins.

2. **Right primitive?** Within the phase tier, is each primitive the best fit? Common mismatches:
   - `useLifecycle` for timed sequences → should be `useLoop` with `frame.elapsed` (see [timed-sequences.md](./timed-sequences.md))
   - `useLoop` for a single cheap value → should be `useTween`
   - `useLifecycle` when phase should drive the clock → should be `useLoop` or `useCanvas`
   - Raw `IntersectionObserver` / `ResizeObserver` / `MutationObserver` → should be `useSight` / `useSize` / `useMutation` (pooled, lifecycle-aware)
   - Manual rAF loops → should be `useLoop` or `useCanvas`

3. **Right options?** Check for suboptimal configuration:
   - `useLoop` at 60fps for state-machine transitions that only need `fps: 1` or `fps: 2`
   - `useSight` / `useScrollProgress` / `useSize` re-rendering when the value only drives imperative work → use transient mode (`onVisibilityChange` / `onProgress` / `onResize`)
   - `useSight` with `observe: 'continuous'` for a one-shot trigger → use `observe: 'once'`
   - `WhenVisible` with default `rootMargin` when preloading headroom should be tuned

4. **Missing phase?** Look for animation or rendering code that has no lifecycle management:
   - Animations that keep running in background tabs or off-screen
   - Raw `requestAnimationFrame` loops without visibility pausing
   - Long pages with heavy off-screen sections → candidates for `Defer`
   - Heavy below-fold components → candidates for `WhenVisible` or `WhenIdle`
   - Missing `prefers-reduced-motion` handling on non-phase animations

### Known gotchas (static)

These are the most common specific mistakes. Grep for them.

5. **CSS initial state matches animation start.** Elements animated by `useLoop` must have their pre-animation state set in CSS (e.g., `scaleX(0)`, `opacity: 0`). The loop doesn't fire until the element enters the viewport. Without a CSS initial state, the element renders at its natural size, then snaps to the animation start on the first tick — causing a visible flash. See [timed-sequences.md](./timed-sequences.md).
6. **No `setTimeout`/`setInterval` in animation paths.** Timers don't participate in phase's lifecycle. They keep running off-screen and restart from zero on re-entry. Replace with `useLoop` + `frame.elapsed` (see [timed-sequences.md](./timed-sequences.md)).
7. **No core API in React when hooks would work.** `createLoop`/`createTicker`/`createLifecycle` in a React component should be `useLoop`/`useCanvas`/`useLifecycle` unless there's a specific reason (custom hook composition, `AbortController` teardown, imperative manager).
8. **No `setState` in frame callbacks.** `onTick`/`draw` must write to refs or DOM directly. `setState` at 60fps causes 60 re-renders/sec.
9. **No allocations in `onTick`/`draw`.** No object/array literals, no `.map()`/`.filter()`, no closures, no spreads. Template literals for the final `style.*` write are acceptable.
10. **No forced reflows in animation paths.** No `getBoundingClientRect()`, `offsetWidth`, `getComputedStyle()`. Use `useSize` for dimensions.

### Runtime checks (behavioral)

If you can run the code, verify these at runtime.

11. **No flash on first entry.** Refresh the page above the animated section, then scroll down to it. The animation should start cleanly from its initial state — no flash where the element appears at full size then snaps to zero. If it flashes, the CSS initial state doesn't match the animation start (see item 5).
12. **Animations pause off-screen.** Scroll the element out of view, wait, scroll back. CPU should be zero while hidden. If timers or rAF loops are still firing, something bypasses phase's lifecycle.
13. **Animations resume without restarting.** Scroll away mid-sequence, scroll back. The animation should pick up where it left off, not replay from the beginning. A restart means timing is `Date.now()`-based or timer-based instead of `frame.elapsed`-based.
14. **Reduced motion works.** Enable `prefers-reduced-motion: reduce` in devtools. Decorative animations should pause or complete instantly. Phase handles this automatically, but timer-based or manual rAF workarounds bypass it.
15. **Tab switch pauses correctly.** Switch to another tab, wait, switch back. Same as off-screen: zero CPU while hidden, smooth resume without restart.

For migration pattern mappings (framer-motion → phase), see [decision-guide.md](./decision-guide.md).

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical.** Causes jank or accessibility failures
2. **High.** Wastes significant CPU or leaks resources
3. **Medium.** Suboptimal but functional
4. **No change.** Already well-implemented (list briefly for completeness)

End with a summary: "Found N candidates, M actionable, K already optimal."
