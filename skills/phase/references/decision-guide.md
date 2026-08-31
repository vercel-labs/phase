# Decision guide

How to choose between browser-driven animation, minimal JS, phase, or an external animation library.

## The ladder

Always prefer the cheapest tier. Moving up the ladder adds JS, runtime cost, and bundle weight, which is only justified when the lower tier genuinely cannot do the job.

```
Browser-driven (CSS / WAAPI)  →  Minimal JS (useTween)  →  phase primitives  →  External library
```

### Tier 1: Browser-driven (CSS or WAAPI)

Use CSS when the animation:

- Is triggered by a state class, pseudo-class, or attribute change (`:hover`, `data-*`, `[open]`)
- Is a pure enter/exit transition (`@starting-style` + `transition`, or `animation`)
- Uses View Transitions API for route/page changes

Examples: fade in on mount, slide on hover, opacity toggle, cross-fade between routes.

Use WAAPI (`Element.animate`) when the complete, browser-animatable timeline is known at start but its keyframes are generated from runtime data or need imperative `play()`, `pause()`, or `currentTime` control. CSS and WAAPI both let the browser sample keyframes without an author-owned per-frame callback. `transform` and `opacity` can then run on the compositor; other properties may still require style, layout, or paint.

#### Browser-driven timelines: CSS or WAAPI

Before choosing `useLoop`, ask whether the browser can own the future frames:

- Progress comes from a browser-owned document, scroll, or view timeline instead of an author-owned per-frame callback.
- Each target's values can be represented as CSS-animatable keyframes, ideally `transform` and `opacity`. For a document-time sequence, the targets and keyframes are known when playback starts.
- No JavaScript side effect is required on every frame.

If all three are true, prefer CSS for static keyframes and WAAPI for generated or imperatively controlled keyframes. Use `useLifecycle` only as the _when_ layer when playback must pause off-screen or for reduced motion. Do not keep `useLoop` merely because the sequence has many steps or depends on elapsed time.

### Tier 2: Minimal JS (`useTween`)

Use when:

- You need to animate a single numeric value into React render output (counter, progress bar, opacity driven by data)
- The render is cheap (one element, minimal diffing)
- You do NOT need per-frame DOM writes, canvas, or visibility-aware pausing

`useTween` calls `setState` per frame, acceptable only when the render tree below it is small. If the animated value drives a large subtree, move to Tier 3 (`useLoop` with ref-based DOM writes).

Reduced motion: jumps to target instantly (value still arrives, animation skipped).

### Tier 3: phase primitives

Use when you need any of:

- Per-frame JS that cannot be expressed as browser keyframes (live inputs, simulation, canvas draws, WebGL)
- Visibility-aware pausing (zero CPU off-screen)
- Lifecycle signals for an external renderer (three.js, Pixi, Web Worker)
- Mount/unmount transitions with exit animations
- Scroll-driven reveals, element sizing, or media-query reactivity

| Scenario                                        | Primitive                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| DOM animation loop                              | `useLoop`                                                                  |
| Canvas/WebGL loop                               | `useCanvas`                                                                |
| Signal for your own renderer                    | `useLifecycle`                                                             |
| Mount/unmount with exit                         | `Presence`, `usePresence`                                                  |
| Swap between states with exit→enter             | `Swap`                                                                     |
| Lazy mount on viewport entry                    | `WhenVisible`                                                              |
| Lazy mount when the browser is idle             | `WhenIdle`, `useIdle`                                                      |
| Prefetch / side effect when idle                | `useWhenIdle`                                                              |
| Skip painting off-screen (keep DOM)             | `Defer`                                                                    |
| Pause raw work inside a `Defer`                 | `useRenderState`                                                           |
| Visibility ratio (reveal effects)               | `useScrollProgress`                                                        |
| Scroll container offset (scrollbars, carousels) | `useScroll`                                                                |
| Element dimensions                              | `useSize`, `useContainerQuery`                                             |
| Media query subscription                        | `useMediaQuery`                                                            |
| Visibility boolean                              | `useSight`                                                                 |
| Timed multi-step animation sequence             | CSS/WAAPI + `useLifecycle` when keyframe-friendly; `useLoop` when JS-owned |

All phase primitives share:

- Zero per-frame allocations
- Automatic reduced-motion handling
- Pooled observers (IO/RO/MQL) when they preserve target and callback-output contracts; specialized raw observers require explicit ownership and teardown review
- Clean teardown on unmount

#### Which scroll primitive?

Four different questions, four different answers. The two phase primitives are named alike but are not interchangeable:

| You want                                                        | Reach for                      | Why                                                                                           |
| --------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| How much of element X is visible in the viewport (reveal, fade) | `useScrollProgress`            | IntersectionObserver ratio (0–1); no scroll listener; plateaus when X fills the viewport      |
| How far container X is scrolled through its content (scrollbar) | `useScroll`                    | scroll offset + progress + thumb ratio; reads `scrollLeft` per frame, geometry only on resize |
| A CSS-declarative scroll-linked animation                       | native `ScrollTimeline`        | compositor-driven, no JS per frame                                                            |
| Spring- or gesture-driven scroll                                | `motion` (its own `useScroll`) | phase does not do springs or gestures                                                         |

The trap: both phase hooks return a 0–1 number, but `useScrollProgress`'s is a _visibility_ fraction and `useScroll`'s `progressX/Y` is a _position_ fraction. Pick by the question, not by the number.

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

1. Can the browser own playback (CSS for static keyframes, WAAPI for a generated browser-animatable timeline)? → **Browser-driven.**
2. Is it one value into a cheap render? → **`useTween`** (or still CSS if the value maps to a CSS property).
3. Do you need live per-frame JS, canvas, or lifecycle signals? → **phase.** (`useLifecycle` can gate Tier 1 playback without moving its frames into JS.)
4. Do you need springs, gestures, or keyframe orchestration? → **External library** (and phase can still manage the lifecycle around it via `useLifecycle`).

## Combining tiers

### phase + WAAPI

Use WAAPI for a browser-animatable timeline and `useLifecycle` to pause/resume it. Create animations once; lifecycle changes call `play()` or `pause()` rather than rebuilding keyframes. This keeps phase's visibility decision while removing the author-owned frame loop. For reduced motion, skip WAAPI setup and render a meaningful static CSS state instead of merely pausing at keyframe zero. WAAPI is not automatically composited: stay on `transform`/`opacity` where possible and verify in a performance trace. In particular, repeated SVG transform-list or geometry-attribute writes can still require layout or paint; prefer a CSS transform on an HTML wrapper when possible. See [timed-sequences.md](./timed-sequences.md) for the pattern.

### phase + external library

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

- Manual `requestAnimationFrame` loops without visibility pausing → CSS/WAAPI when the browser can own animatable keyframes; `useLoop` / `useCanvas` when frames require live JS
- Raw `IntersectionObserver` for visibility gating → `useSight` / `useLifecycle` when target cardinality and callback output are preserved; otherwise no change with ownership and teardown evidence
- Raw `ResizeObserver` for dimensions → `useSize` when its target and entry-output contract fits; otherwise no change with ownership and teardown evidence
- Repeated `setState` inside rAF → `useLoop` with ref-based DOM writes; retain only guarded terminal updates that stop rescheduling
- `getBoundingClientRect()` in animation paths → `useSize` (async, no reflow)
- Animations that keep running in background tabs → `useLoop` (auto-pauses)
- Missing `prefers-reduced-motion` handling → phase pauses automatically; browser-driven playback still needs a meaningful static CSS fallback
- Manual `transitionend` listeners for unmount → `Presence` / `Swap`
- `setTimeout`/`setInterval` chains for multi-step animation sequences → CSS/WAAPI when the sequence is predetermined and keyframe-friendly; otherwise `useLoop` with elapsed-time step derivation (see [timed-sequences.md](./timed-sequences.md))

## When NOT to replace with phase

- CSS transitions that already work well. Leave them alone.
- Spring animations with interruption. Keep your spring library.
- Gesture-driven animations. Keep your gesture library.
- Server-side code that imports easing math. Use `phase/ease` (no browser APIs).

## Migrating from animation libraries

When converting from framer-motion (or similar), map patterns to the cheapest tier that works. Don't convert every `motion.div` to a phase primitive — many are CSS-only transitions that don't need JS at all.

| framer-motion pattern                                             | phase equivalent                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<AnimatePresence>` + `exit` prop                                 | `<Presence>` or `<Swap>` with CSS `@starting-style` + `data-[phase=exiting]`                                                                                              |
| `motion.div` with `initial`/`animate` (opacity, transform)        | CSS `transition` + `@starting-style` (Tier 1). No JS needed for enter/exit.                                                                                               |
| `animate()` with `delay` chains (do X, wait, do Y)                | Native WAAPI/CSS when the sequence is predetermined and keyframe-friendly; `useLoop` only when the steps require live JS (see [timed-sequences.md](./timed-sequences.md)) |
| `stagger` children                                                | CSS `animation-delay` or WAAPI `delay` for known keyframes; `useLoop` for live per-child logic (see [timed-sequences.md](./timed-sequences.md))                           |
| `useInView`                                                       | `useSight` (reactive phase) or `useLifecycle` (animation gating)                                                                                                          |
| `useScroll` (motion's scroll-position hook)                       | phase's `useScroll` for a container's offset (scrollbars/carousels); `useScrollProgress` for viewport reveal ratio; `ScrollTimeline` for CSS scroll-linked animation      |
| `layout` animations (animating between measured positions)        | Keep framer-motion. Phase does not do layout animation.                                                                                                                   |
| Spring physics (`type: 'spring'`)                                 | Keep framer-motion. Phase does not do springs.                                                                                                                            |
| Gesture-driven (`drag`, `whileTap`)                               | Keep framer-motion or `@use-gesture`. Phase does not handle gestures.                                                                                                     |
| `useMotionValue` + `useTransform` (continuous computed animation) | `useLoop` with `onTick` for per-frame DOM writes, or `useScrollProgress` if scroll-driven                                                                                 |

### Reviewing phase code

After any phase work, ask: is it using phase to the best of its ability? Right tier, right primitive, right options, nothing missing? See [audit.md](./audit.md) for the review framework.

## Common mistakes

- **Recommending phase for a CSS-only animation.** If `@starting-style` + `transition` or a CSS `animation` handles the enter/exit, don't add JS. Phase is for when CSS genuinely can't do it.
- **Using `useLoop` when `useTween` is sufficient.** If you're animating one value into render output and the component is cheap, `useTween` has a smaller API surface and bundle. `useLoop` is for when you need ref-based DOM writes or many values.
- **Using `useLifecycle` expecting it to drive frames.** It only gives you an active/paused signal. CSS, WAAPI, or an external renderer must own playback; use `useLoop` or `useCanvas` only when phase must drive the clock.
- **Forgetting that `createLoop` has no `pause()`/`resume()`.** It's signal-driven (visibility, reduced motion, quality). For manual control, use `createLifecycle` which exposes `pause()`/`resume()`, or use the React hook's `enabled` prop.
- **Reaching for an external library for enter/exit transitions.** `Presence`, `Swap`, and `WhenVisible` handle mount/unmount with CSS `@starting-style` + `transitionend`. You don't need a library for this.
- **Confusing `useScrollProgress` with `useScroll`.** The first is a viewport visibility ratio (reveals, parallax); the second is a scroll container's own offset (scrollbars, carousels). See the "Which scroll primitive?" table above.
- **Using `useLifecycle` + `setTimeout`/`setInterval` to build timed animation sequences.** `useLifecycle` only provides visibility signals. Use CSS/WAAPI when the sequence is predetermined and keyframe-friendly, or `useLoop` with `frame.elapsed` when JavaScript must own the steps. See [timed-sequences.md](./timed-sequences.md).
- **Using `createLoop` / `createTicker` / `createLifecycle` in React when the hook would work.** Prefer the hook equivalents (`useLoop`, `useCanvas`, `useLifecycle`) — they manage refs, teardown, and `enabled` automatically. Reach for core primitives only when the hook doesn't fit: custom hooks composed from multiple primitives, `AbortController`-based teardown, or imperative managers that own their lifecycle.
