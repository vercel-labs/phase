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

### Verification checklist

After any phase work — new code, migration, or refactor — verify that each usage is at the right tier, with the right primitive, and the right options. The full checklist is in [audit.md](./audit.md). It covers:

- **Optimal usage review.** Right tier? Right primitive? Right options? Missing phase where it should be?
- **Known gotchas.** No timers in animation paths, no core API in React when hooks work, no `setState`/allocations/reflows in `onTick`.
- **Runtime checks.** Animations pause off-screen and on tab switch, resume without restarting, reduced motion works.

## Common mistakes

- **Recommending phase for a CSS-only animation.** If `@starting-style` + `transition` or a CSS `animation` handles the enter/exit, don't add JS. Phase is for when CSS genuinely can't do it.
- **Using `useLoop` when `useTween` is sufficient.** If you're animating one value into render output and the component is cheap, `useTween` has a smaller API surface and bundle. `useLoop` is for when you need ref-based DOM writes or many values.
- **Using `useLifecycle` expecting it to drive frames.** It only gives you an active/paused signal. It does not schedule `requestAnimationFrame`. Use `useLoop` or `useCanvas` when you want phase to drive the clock.
- **Forgetting that `createLoop` has no `pause()`/`resume()`.** It's signal-driven (visibility, reduced motion, quality). For manual control, use `createLifecycle` which exposes `pause()`/`resume()`, or use the React hook's `enabled` prop.
- **Reaching for an external library for enter/exit transitions.** `Presence`, `Swap`, and `WhenVisible` handle mount/unmount with CSS `@starting-style` + `transitionend`. You don't need a library for this.
- **Using `useScrollProgress` expecting continuous scroll-scrubbing.** It reports intersection ratio, which plateaus for tall elements. For scroll-position-driven animation, use `ScrollTimeline` or `motion`'s `useScroll`.
- **Using `useLifecycle` + `setTimeout`/`setInterval` to build timed animation sequences.** `useLifecycle` only provides visibility signals — it doesn't drive timing. The timers keep firing off-screen, restart from zero when scrolling back, and don't participate in phase's lifecycle. Use `useLoop` with `frame.elapsed` instead: elapsed time freezes during pause, so sequences resume where they left off. See [timed-sequences.md](./timed-sequences.md).
- **Using `createLoop` / `createTicker` / `createLifecycle` in React when the hook would work.** Prefer the hook equivalents (`useLoop`, `useCanvas`, `useLifecycle`) — they manage refs, teardown, and `enabled` automatically. Reach for core primitives only when the hook doesn't fit: custom hooks composed from multiple primitives, `AbortController`-based teardown, or imperative managers that own their lifecycle.
