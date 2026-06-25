<p align="center">
  <img src=".github/assets/phase-header.png" alt="phase" />
</p>

# ▲ phase

> **Status: Alpha** — APIs are evolving rapidly. Expect breaking changes.

The lifecycle-aware performance layer for the web. Know when to animate, when to render, and when to pause.

## Why phase

You can't accidentally tank the main thread, leak an observer, jank on scroll, or ignore reduced motion. The hard parts are handled for you, so the slow path isn't even reachable:

- **Pauses when unseen** — off-screen or in a background tab, work stops and CPU drops to zero.
- **Respects reduced motion by default** — accessibility is built in, not an opt-in.
- **Never forces a reflow** — no `getBoundingClientRect`, no layout thrash, anywhere in the package.
- **Zero re-renders from the frame loop** — per-frame work writes to refs and the DOM, never React state.
- **Frame-locked shared clock** — every animation on the page reads one clock, so nothing drifts out of sync.
- **Renders only what matters** — skip painting off-screen content, mount non-critical UI when idle.

Each guarantee is a [tested invariant](#guarantees), not an aspiration — and every export stays [sub-kilobyte to a few kilobytes](#bundle-size).

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Philosophy](#philosophy)
- [Scope](#scope)
- [Entry points](#entry-points)
- [Core API](#core-api)
  - [createLoop](#createloop)
  - [createTicker](#createticker)
  - [createSight](#createsight)
  - [createLifecycle](#createlifecycle)
  - [createScrollProgress](#createscrollprogress)
  - [prefersReducedMotion](#prefersreducedmotion)
- [Easing and math](#easing-and-math)
- [Choosing a primitive](#choosing-a-primitive)
- [React hooks](#react-hooks)
  - [useLoop](#useloop)
  - [useLifecycle](#uselifecycle)
  - [useCanvas](#usecanvas)
  - [useTween](#usetween)
  - [usePresence](#usepresence)
  - [useScrollProgress](#usescrollprogress)
  - [Utility hooks](#utility-hooks)
- [React components](#react-components)
  - [How animations work](#how-animations-work)
  - [Presence](#presence)
  - [WhenVisible](#whenvisible)
  - [Swap](#swap)
- [Rendering](#rendering)
  - [Defer](#defer)
  - [WhenIdle](#whenidle)
  - [useWhenIdle](#usewhenidle)
  - [useRenderState](#userenderstate)
- [Guarantees](#guarantees)
- [Errors](#errors)
- [Relationship to View Transitions](#relationship-to-view-transitions)
- [Bundle Size](#bundle-size)
- [Agent skill](#agent-skill)

## Install

```bash
pnpm add phase
```

## Quick start

```tsx
import { useLoop } from 'phase/react';

function Orbit({ radius }) {
  const speed = 1; // radians per second
  const { ref } = useLoop({
    onTick: (frame) => {
      const angle = (frame.elapsed / 1000) * speed;
      ref.current.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
    },
  });

  return <div ref={ref} className="dot" />;
}
```

Four lines of animation code. Behind them, performance-critical plumbing:

- **Pauses when invisible.** Scrolled off-screen or background tab? Zero CPU consumed.
- **Respects reduced motion.** Accessibility is the default, not an opt-in.
- **Resumes without teleporting.** Elapsed time freezes during pause, picks up where it left off.
- **Clean teardown.** Unmount the component and walk away. Nothing leaks.

## Philosophy

Every primitive in `phase` exposes its state as a **phase** (a single string: `idle`, `running`, `paused`, `active`, `exiting`...) paired with a **reason** explaining _why_ that transition happened.

```ts
const { phase, phaseReason } = useLoop({ onTick: draw });

// phase: 'paused'  phaseReason: 'sight'           → off-screen
// phase: 'paused'  phaseReason: 'reduced-motion'  → user disabled motion
// phase: 'running' phaseReason: 'resumed'         → came back into view
```

One string replaces `if (running && visible && !paused && !prefersReducedMotion && mounted)`.

Each of those signals is also a CPU and battery decision. Animating while off-screen, ignoring reduced motion, or running after unmount is what burns cycles and causes jank — so `phase` composes them once, correctly, instead of leaving each call site to get the conjunction right.

Safe behavior is automatic. Visibility awareness, reduced motion, observer cleanup, and delta clamping are defaults, not opt-ins. Bypassing reduced motion requires an explicit `reducedMotion: 'ignore'` in the diff.

## Scope

`phase` composes signals (visibility, focus, reduced motion, frame budget) into a coherent lifecycle with a reason for every state transition.

**Handles:** lifecycle state, timing, visibility, scroll visibility-ratio, reduced motion, observer pooling, quality signals, frame loops.

**Does not handle:** spring physics, gesture systems, declarative keyframe orchestration. Reach for a dedicated library (e.g. `motion`) when you need those.

This narrow scope is deliberate. Shipping only the performance-critical plumbing — and nothing else — is what keeps every export [sub-kilobyte to a few kilobytes](#bundle-size).

## Entry points

| Import        | Contents                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `phase`       | Core primitives: createLoop, createTicker, createSight, createLifecycle, createScrollProgress, errors |
| `phase/ease`  | Easing functions and math utilities only                                                              |
| `phase/react` | React hooks and components                                                                            |

Each entry point is independently tree-shakeable. Importing `phase/ease` in a server component pulls zero browser APIs.

## Core API

### createLoop

The main primitive. Composes a ticker, visibility observer, and reduced-motion listener into a lifecycle-aware animation loop.

```ts
import { createLoop } from 'phase';

const loop = createLoop({
  element: el,
  onTick: (frame) => {
    // frame.time    — performance.now()
    // frame.delta   — ms since last tick (clamped to 40ms)
    // frame.elapsed — ms since start (paused time excluded)
    // frame.frame   — frame count
  },
});

loop.start();
// loop.phase       === 'running'
// loop.phaseReason === 'started'
```

#### Loop phases

| Phase     | Meaning                          | Possible reasons                      |
| --------- | -------------------------------- | ------------------------------------- |
| `idle`    | Created but not started          | `initial`                             |
| `running` | Actively ticking                 | `started`, `resumed`                  |
| `paused`  | Temporarily stopped, will resume | `sight`, `reduced-motion`, `degraded` |
| `stopped` | Permanently disposed             | `manual`, `disposed`                  |

#### Quality signals

`phase` and `quality` are orthogonal. A loop can be `running` + `degraded` (still animating, but at reduced fidelity to preserve resources).

| Quality    | Meaning               | What changes                      |
| ---------- | --------------------- | --------------------------------- |
| `full`     | Normal operation      | Configured FPS, full DPR          |
| `degraded` | Resources constrained | FPS capped to 30, DPR drops to 1x |

Two signals trigger degradation:

| Trigger      | `qualityReason`  | When                                           | Recovery                 |
| ------------ | ---------------- | ---------------------------------------------- | ------------------------ |
| Window blur  | `'unfocused'`    | User switches to another window                | Recovers on window focus |
| Frame budget | `'frame-budget'` | 3+ consecutive frames exceed the 16.6ms budget | Does not auto-recover    |

Read `loop.quality` and `loop.qualityReason` to adapt rendering (fewer particles, simpler shaders, skip non-essential visual passes).

#### The `degraded` option

Controls the loop's response when quality degrades. Same three-value pattern as `reducedMotion`.

| Value        | Behavior                                             | Use case                                            |
| ------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `'throttle'` | Cap FPS (default 30, configurable via `degradedFps`) | Most animations. Still runs, just slower            |
| `'pause'`    | Pause the loop entirely                              | Heavy canvas/WebGL. If it can't run well, don't run |
| `'ignore'`   | Keep running at full quality                         | Critical UI that must never degrade                 |

```ts
createLoop({
  element: el,
  onTick: draw,
  degraded: 'throttle', // default
  degradedFps: 20, // only accepted when degraded is 'throttle'
});
```

#### Loop options

| Option          | Type                                | Default      | Description                               |
| --------------- | ----------------------------------- | ------------ | ----------------------------------------- |
| `element`       | `Element`                           | required     | Element to observe for visibility         |
| `onTick`        | `(frame: FrameState) => void`       | required     | Called each frame while running           |
| `fps`           | `number`                            | —            | Cap frames per second                     |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior when user prefers reduced motion |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades            |
| `degradedFps`   | `number`                            | `30`         | FPS cap in degraded throttle mode         |
| `onPhaseChange` | `(phase, reason) => void`           | —            | Called on every phase transition          |

### createTicker

The low-level rAF clock underneath `createLoop`. Use it when you need a frame loop without visibility management (background processing, audio sync, non-visual timing).

```ts
import { createTicker } from 'phase';

const ticker = createTicker({
  onTick: (frame) => {
    /* runs every frame */
  },
  fps: 30,
});
ticker.start();
```

All tickers share a single `requestAnimationFrame` loop. Every subscriber reads the same `performance.now()` value each frame, so independent animations stay in visual sync.

#### Ticker phases

| Phase     | Meaning                  | Transitions                 |
| --------- | ------------------------ | --------------------------- |
| `idle`    | Created, not started     | → `running` via `start()`   |
| `running` | Actively ticking         | → `paused` via `pause()`    |
| `paused`  | Suspended, resumable     | → `running` via `resume()`  |
| `stopped` | Terminal, cannot restart | via `stop()` from any state |

### createSight

Answers one question: can the user see this element right now? Combines `document.visibilitychange`, `pageshow` (bfcache restore), and `IntersectionObserver` into a single phase.

```ts
import { createSight } from 'phase';

const sight = createSight({
  element: el,
  onPhaseChange: (phase, reason) => {
    // phase:  'visible' | 'hidden' | 'unknown'
    // reason: 'initial' | 'viewport' | 'document' | 'bfcache' | 'all-hidden'
  },
});
```

`phase` is `'visible'` only when the document is visible AND the element is in the viewport. Uses a pooled `IntersectionObserver` (20 elements with the same options share one observer instance).

### createLifecycle

The activation decision for an animation, decoupled from who drives the frames. Composes visibility (`createSight`), reduced motion, and a manual pause into a single `active` / `paused` phase.

Use `createLifecycle` when you own your render loop (a three.js/WebGL renderer, a Web Worker, or any non-rAF work that should pause when off-screen or under reduced motion). When you want `phase` to drive the loop for you, use [`createLoop`](#createloop) instead.

```ts
import { createLifecycle } from 'phase';

const lifecycle = createLifecycle({
  element: canvas,
  onPhaseChange: (phase, reason) => {
    // phase:  'idle' | 'active' | 'paused' | 'stopped'
    // reason: 'started' | 'resumed' | 'sight' | 'reduced-motion' | 'manual' | 'disposed' | 'initial'
    if (phase === 'active') renderer.start();
    else renderer.stop(); // your loop, your teardown
  },
});

// Manual pause (e.g. a panel opened over the hero):
lifecycle.pause();
lifecycle.resume();

// cleanup:
lifecycle.stop();
```

`createLoop` is built on `createLifecycle` (it adds a ticker and quality signals on top). Loop-level optimizations (shared clock, zero-allocation `FrameState`, delta clamping, FPS cap, strong pause) only apply when `phase` drives the loop. Lifecycle-level optimizations (pooled observers, composed document-visibility + bfcache + viewport, reduced motion) carry over to consumer-owned loops.

#### Lifecycle phases

| Phase     | Meaning                          | Possible reasons                    |
| --------- | -------------------------------- | ----------------------------------- |
| `idle`    | Created but not started          | `initial`                           |
| `active`  | Should be animating              | `started`, `resumed`                |
| `paused`  | Off-screen, reduced motion, etc. | `sight`, `reduced-motion`, `manual` |
| `stopped` | Permanently disposed             | `disposed`                          |

Pause priority is `reduced-motion` > `sight` > `manual`.

### createScrollProgress

Reports what fraction of an element is currently visible in the viewport (0–1), via the shared IntersectionObserver pool. Zero forced reflows, zero extra observers. Ideal for reveal/opacity effects.

> **Not a scroll-scrubbing engine.** This reports `intersectionRatio`, which plateaus for tall elements once they fill the viewport. For continuous scroll-driven animation, use `motion`'s `useScroll` or the native `ScrollTimeline` API.

```ts
import { createScrollProgress } from 'phase';

const progress = createScrollProgress({
  element: el,
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  },
});

// progress.ratio === 0.65 (synchronous read)

// cleanup:
progress.stop();
```

The `steps` option controls threshold granularity. Default `20` generates 21 evenly-spaced thresholds (0%, 5%, 10%, …, 100%). Multiple instances with the same `steps` share a single IO — zero extra observers.

#### ScrollProgress options

| Option       | Type                          | Default  | Description                        |
| ------------ | ----------------------------- | -------- | ---------------------------------- |
| `element`    | `Element`                     | required | Element to observe                 |
| `onProgress` | `(ratio: number) => void`     | required | Called at each threshold crossing  |
| `steps`      | `number`                      | `20`     | Number of evenly-spaced thresholds |
| `root`       | `Element \| Document \| null` | —        | IO root element                    |
| `rootMargin` | `string`                      | —        | IO root margin                     |

### prefersReducedMotion

Returns `true` when the user has enabled reduced motion at the OS level. Use it to gate expensive setup or dynamic imports.

```ts
import { prefersReducedMotion } from 'phase';

if (!prefersReducedMotion()) {
  const { startParticleSystem } = await import('./particles');
  startParticleSystem(canvas);
}
```

All hooks and primitives consult this signal automatically. You only need it directly for conditional imports or setup logic.

## Easing and math

Pure functions. No browser APIs, no side effects, no React. Safe in server components, build scripts, and tests.

```ts
import { lerp, clamp01, easeOutCubic, remap } from 'phase/ease';
```

### Easing functions

| Function         | Character                       |
| ---------------- | ------------------------------- |
| `easeOutCubic`   | Fast start, smooth deceleration |
| `easeOutQuart`   | Sharper deceleration            |
| `easeOutBack`    | Overshoots target, snaps back   |
| `easeInOutCubic` | Symmetric S-curve               |
| `linear`         | No easing (identity)            |

All easing functions take a progress value (0–1) and return a curved progress value (0–1). They don't know about time, pixels, or anything else — they reshape a number.

### Math utilities

| Function                         | Description                    | Example                            |
| -------------------------------- | ------------------------------ | ---------------------------------- |
| `clamp(value, min, max)`         | Constrain to range             | `clamp(150, 0, 100)` → `100`       |
| `clamp01(value)`                 | Constrain to 0–1               | `clamp01(-0.5)` → `0`              |
| `lerp(start, end, t)`            | Linear interpolation           | `lerp(0, 100, 0.5)` → `50`         |
| `inverseLerp(start, end, value)` | Where is value in range? (0–1) | `inverseLerp(0, 100, 75)` → `0.75` |
| `remap(options)`                 | Map from one range to another  | Input range → output range         |

### The pattern

```ts
const progress = clamp01(elapsed / duration); // normalize time to 0–1
const eased = easeOutCubic(progress); // reshape the curve
const value = lerp(startPos, endPos, eased); // map to your range
```

Easing, interpolation, and your value range are three separate concerns. `phase` keeps them separate so you can mix and match.

## Choosing a primitive

| Need                                              | Use                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Know if it's on screen?                           | `useSight` (visibility only)                                            |
| Want `phase` to run your frame loop?              | `useLoop` (DOM) / `useCanvas` (canvas)                                  |
| You own the loop (WebGL, three.js, a Web Worker)? | `useLifecycle` (active/paused signal)                                   |
| Animating one value into render?                  | `useTween`                                                              |
| Mount/unmount transitions?                        | `Presence` / `Swap` / `WhenVisible`                                     |
| Skip painting off-screen content (keep in DOM)?   | `Defer`                                                                 |
| Mount non-critical UI when the browser is idle?   | `WhenIdle` / `useIdle`                                                  |
| Prefetch or run a side effect when idle?          | `useWhenIdle`                                                           |
| Pause raw work inside a `Defer` subtree?          | `useRenderState`                                                        |
| Reactive scroll/size/media values?                | `useScrollProgress` / `useSize` / `useContainerQuery` / `useMediaQuery` |

**`useSight` vs `useLifecycle`:** `useSight` reports pure visibility (for lazy-mounting, analytics, `WhenVisible`). `useLifecycle` folds in reduced motion and a manual pause, so you can't accidentally animate for users who asked not to. If you're gating an animation, use `useLifecycle`. If you're gating content, use `useSight`.

## React hooks

### useLoop

The primary React hook. Wraps `createLoop` with React lifecycle management.

```tsx
import { useLoop } from 'phase/react';

const { ref, phase, phaseReason } = useLoop({
  onTick: (frame) => {
    ref.current.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
  },
});
return <div ref={ref} />;
```

Attach the returned `ref` to the element you want to animate. To bring your own, pass `ref` in the options.

Your `onTick` callback always sees the latest props, state, and refs without restarting the loop (stored internally via `useSyncedRef`).

**Never call `setState` inside `onTick`.** It runs 60 times per second. Write to refs or the DOM directly. The only re-render trigger is `phase` changing (an infrequent lifecycle event).

### useLifecycle

The activation signal for a loop you own. Wraps [`createLifecycle`](#createlifecycle), returning `active` / `paused` so a consumer-owned render loop (WebGL, three.js, a Web Worker) can pause when off-screen or under reduced motion.

```tsx
import { useLifecycle } from 'phase/react';

function Hero() {
  const { ref, isActive } = useLifecycle();

  useEffect(() => {
    if (!isActive) return; // off-screen / reduced motion / paused
    let raf = requestAnimationFrame(function render() {
      renderer.render();
      raf = requestAnimationFrame(render);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  return <canvas ref={ref} />;
}
```

| Option                | Type                       | Default   | Description                                           |
| --------------------- | -------------------------- | --------- | ----------------------------------------------------- |
| `ref`                 | `RefObject`                | returned  | Bring your own, or attach the returned `ref`          |
| `reducedMotion`       | `'pause' \| 'ignore'`      | `'pause'` | Whether reduced motion pauses the lifecycle           |
| `paused`              | `boolean`                  | `false`   | Manual pause (e.g. a panel opened over the animation) |
| `enabled`             | `boolean`                  | `true`    | When `false`, tears down and reports `idle`           |
| `intersectionOptions` | `IntersectionObserverInit` | —         | Forwarded to the underlying observer                  |

Returns `{ ref, phase, phaseReason, isActive }`. See [Choosing a primitive](#choosing-a-primitive) for `useSight` vs `useLifecycle`.

### useCanvas

Everything `useLoop` provides, plus DPR-aware buffer sizing, ResizeObserver coalescing, and GPU context loss recovery.

```tsx
import { useRef } from 'react';
import { useCanvas } from 'phase/react';

const containerRef = useRef(null);
const canvasRef = useRef(null);

const { phase } = useCanvas({
  containerRef,
  canvasRef,
  draw: (ctx, frame, size) => {
    ctx.clearRect(0, 0, size.width, size.height);
    // ctx is already scaled for devicePixelRatio — draw in CSS pixels
  },
});

return (
  <div ref={containerRef}>
    <canvas ref={canvasRef} />
  </div>
);
```

`useCanvas` coordinates two elements (a sizing container and the canvas), so you pass both refs in.

| Concern      | How useCanvas handles it                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| DPR (retina) | Uses `devicePixelContentBoxSize` for exact physical pixels when available, falls back to `width * dpr`. Listens for DPR changes. |
| Resize       | Shared ResizeObserver. Canvas resized on container change. No `getBoundingClientRect`.                                           |
| Context loss | Listens for `contextlost`/`contextrestored`. Pauses on loss, recovers on restore.                                                |
| Quality      | When degraded, DPR drops to 1x automatically (halves GPU pixel count).                                                           |

Both hooks accept the same quality controls as `createLoop`: `degraded` and `degradedFps`. For heavy GPU work, consider `degraded: 'pause'`.

### useTween

Animates a number from A to B over a duration. Calls `setState` per frame (appropriate when the animated value is used in render output).

```tsx
import { useTween } from 'phase/react';

const opacity = useTween({ target: isVisible ? 1 : 0, duration: 300 });
```

Use `useTween` for single values where the render is cheap (counters, progress bars, opacity). Use `useLoop` when animating many elements or doing canvas work, since per-frame `setState` doesn't scale.

Reduced motion default: `'complete'` (jumps to target instantly). The value still reaches its destination; it skips the animation.

### usePresence

The hook behind `<Presence>`. Use directly when you need full control over mount/unmount lifecycle.

```tsx
import { usePresence } from 'phase/react';

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

#### Presence phases

`idle` → `entered` → `exiting` → `exited`

| Phase     | Meaning                                  | `mounted` |
| --------- | ---------------------------------------- | --------- |
| `idle`    | Not shown (initial or after reveal exit) | `false`   |
| `entered` | Visible and active                       | `true`    |
| `exiting` | Exit animation in progress               | `true`    |
| `exited`  | Exit complete, ready for unmount         | `false`   |

#### Options

| Option          | Type                     | Default     | Description                        |
| --------------- | ------------------------ | ----------- | ---------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                  |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM  |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount behavior               |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)       |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion preference handling |

### useScrollProgress

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management — see its [note on scope](#createscrollprogress) (visibility ratio, not scroll-scrubbing).

```tsx
import { useScrollProgress } from 'phase/react';

function FadeIn({ children }) {
  const { ref, progress } = useScrollProgress();
  return (
    <div ref={ref} style={{ opacity: progress }}>
      {children}
    </div>
  );
}
```

Re-renders only at threshold crossings — ~20 per full viewport traversal at default steps. `progress` is `0` before first observation.

### Utility hooks

| Hook                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `useSight`          | Element visibility as a phase (`visible` / `hidden`) |
| `useSize`           | Element dimensions via shared ResizeObserver         |
| `useContainerQuery` | Breakpoint matching against element width            |
| `useScrollProgress` | Element visibility ratio as a 0–1 value              |
| `useMediaQuery`     | CSS media query subscription (shared MQL pool)       |
| `useSyncedRef`      | Ref always in sync with latest value                 |
| `useStableCallback` | Stable-identity function that calls latest closure   |

## React components

### How animations work

One CSS pattern covers enter and exit across `Presence`, `WhenVisible`, and `Swap`:

```tsx
className =
  'transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0';
```

No `motion-reduce:` class needed. Reduced motion is handled automatically.

**Enter:** CSS `@starting-style` animates the element natively when `data-enter="animate"` is present. Zero JS during the animation.

**Exit:** `phase` stamps `data-phase="exiting"`, waits for `transitionend`/`animationend` (or a safety timeout), then unmounts. JS coordination is required because CSS has no "animate then remove from DOM" primitive.

**Reduced motion:** `phase` suppresses `data-enter="animate"` and skips the exit animation (instant unmount). No consumer effort.

### Presence

Renders a `div` that manages its own mount/unmount lifecycle, stamping `data-phase` for exit and `data-enter="animate"` for enter.

```tsx
import { Presence } from 'phase/react';

<Presence
  show={isOpen}
  className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
>
  Modal content
</Presence>;
```

| Prop            | Type                     | Default     | Description                       |
| --------------- | ------------------------ | ----------- | --------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                 |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount animation behavior    |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)      |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion handling           |

Two modes:

| Mode       | Behavior                                           | Use case                                 |
| ---------- | -------------------------------------------------- | ---------------------------------------- |
| `'mount'`  | Added to DOM on show, removed after exit completes | Modals, toasts, menus                    |
| `'reveal'` | Always in DOM, visibility toggled via phase        | Scroll reveals, SEO content, IO re-entry |

### WhenVisible

Mounts children when the element enters the viewport. One-shot (once triggered, stays mounted). Uses the pooled IntersectionObserver via `useSight`.

```tsx
import { WhenVisible } from 'phase/react';

<WhenVisible
  rootMargin="200px"
  className="transition-opacity data-[enter=animate]:starting:opacity-0"
>
  <HeavyInteractiveChart />
</WhenVisible>;
```

Common pattern for viewport-gated lazy loading:

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

| Prop         | Type                 | Default   | Description                       |
| ------------ | -------------------- | --------- | --------------------------------- |
| `rootMargin` | `string`             | `'200px'` | IO rootMargin (preload headroom)  |
| `threshold`  | `number \| number[]` | —         | IO threshold                      |
| `root`       | `Element \| null`    | —         | IO root element                   |
| `fallback`   | `ReactNode`          | —         | Shown while awaiting intersection |

Reduced motion is automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion.

### Swap

Coordinated exit-then-enter transitions. The old state fully exits before the new state enters (no overlap, no z-index issues).

```tsx
import { Swap } from 'phase/react';

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
</Swap>;
```

Rapid changes (A → B → C during A's exit) skip intermediate states and advance directly to the latest `active`. First state appears instantly (CLS prevention); subsequent states animate via `@starting-style`.

## Rendering

`phase` is the _when_ layer — when to animate, when to render, when to pause — from one set of signals. Alongside `WhenVisible`, two helpers skip rendering work for off-screen content. They differ in how aggressively they skip and whether the content survives server rendering:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Reach for it when                                  |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

### Defer

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`. Pure CSS — no JS, no observer. Children stay in the DOM and are server-rendered.

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="my-section">
  <ArticleSection />
</Defer>;
```

| Prop              | Type                                   | Default    | Description                                         |
| ----------------- | -------------------------------------- | ---------- | --------------------------------------------------- |
| `estimatedHeight` | `string`                               | `'1000px'` | Reserved size before first paint (any CSS length)   |
| ...rest           | `Omit<ComponentProps<'div'>, 'style'>` | —          | Standard div props except `style` — use `className` |

`contain-intrinsic-size: auto <estimatedHeight>` reserves space, so there is no layout shift — the browser remembers the real size after first paint. `Defer` defers rendering only, not hydration or mounting. There is no `style` prop: the render-skip styles are encapsulated so they can't be overridden — style the wrapper with `className`.

**Animations inside a `Defer` keep running** — `content-visibility` skips paint, not JavaScript. `phase`'s own loops (`useLoop`, `useCanvas`, `useLifecycle`) already self-pause off-screen via their own visibility observer. For raw work (a hand-written `requestAnimationFrame` loop, `setInterval`), gate it with `useRenderState`.

### WhenIdle

Mounts children once the browser is idle after first paint. One-shot. Use it for non-critical UI that should not compete with the critical path. Backed by the `whenIdle` core utility (`requestIdleCallback`).

```tsx
import { WhenIdle } from 'phase/react';

<WhenIdle
  fallback={<Skeleton />}
  className="transition-opacity data-[enter=animate]:starting:opacity-0"
>
  <SecondaryPanel />
</WhenIdle>;
```

| Prop       | Type        | Default | Description                           |
| ---------- | ----------- | ------- | ------------------------------------- |
| `timeout`  | `number`    | —       | Max ms to wait before mounting anyway |
| `fallback` | `ReactNode` | —       | Shown until the browser is idle       |

Idle never fires during SSR, so `WhenIdle` children are absent from server HTML — reserve it for non-critical content. For content that must be crawlable, use `Defer`. Reduced motion is automatic: `data-enter="animate"` is not stamped when the user prefers reduced motion.

### useWhenIdle

Runs a callback once, when the browser is idle after mount — the effect-shaped counterpart to `useIdle`. Use it for side effects (prefetching a chunk, warming a cache) rather than rendering. Cancels on unmount and always calls the latest callback.

```tsx
import { lazy, Suspense, useState } from 'react';
import { useWhenIdle } from 'phase/react';

const openPanel = () => import('./chat-panel');
const ChatPanel = lazy(openPanel);

function Chat() {
  const [open, setOpen] = useState(false);
  useWhenIdle(() => void openPanel()); // prefetch the chunk during idle

  return open ? (
    <Suspense fallback={<Skeleton />}>
      <ChatPanel />
    </Suspense>
  ) : (
    <button onClick={() => setOpen(true)}>Open</button>
  );
}
```

It replaces the common (and easily leaky) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])` — `useWhenIdle` handles cancellation and the SSR guard. Reach for `useIdle` instead when you need to render from the idle signal.

### useRenderState

Reads whether the browser is rendering an element or skipping it under `content-visibility`. Pass it the `ref` from a `Defer` to pause **raw, non-phase** work when the subtree stops painting.

```tsx
import { useRef, useEffect } from 'react';
import { Defer, useRenderState } from 'phase/react';

function Chart() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useRenderState(ref); // 'rendered' | 'skipped'

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

`useRenderState` only listens and reports — it has no layout effect, so it never breaks `Defer`'s no-layout-shift guarantee. You rarely need it for `phase` loops, which already self-pause off-screen.

## Guarantees

These are the performance invariants behind [Why phase](#why-phase) — tested in CI, not aspirations.

### Zero per-frame allocations

`FrameState` is created once and mutated in place every frame. No objects, arrays, closures, template literals, or spread operators in the tick path, and no GC pressure at 60 fps.

### Strong pause

When paused, the ticker calls `cancelAnimationFrame` and stops scheduling entirely. Zero callbacks fire, zero CPU consumed. This is not the "weak pause" pattern of scheduling rAF and returning early.

### Zero forced reflows

No `getBoundingClientRect()`, `offsetWidth`, `scrollWidth`, or `getComputedStyle()` anywhere in the package. All dimensions come from ResizeObserver (async, compositor-aligned) and all visibility from IntersectionObserver.

### Zero React re-renders from the frame loop

The rAF loop never triggers a React re-render. All per-frame state lives in refs; `onTick` writes to refs or the DOM directly. Only `phase` changes trigger re-renders (infrequent lifecycle transitions).

### Frame-locked shared clock

All tickers share one `requestAnimationFrame` loop with a single `performance.now()` read per frame, keeping multiple animations on the same page in visual sync.

### Delta clamping

When a loop resumes after a pause, `frame.delta` is clamped to 40 ms. Animations resume from where they left off with no teleporting.

## Errors

Every error includes a machine-readable `code` and an actionable message.

```ts
import { PhaseError, isPhaseError } from 'phase';
```

| Code               | Trigger                                              |
| ------------------ | ---------------------------------------------------- |
| `server_context`   | Calling a browser-only primitive during SSR          |
| `no_element`       | Passing a null or undefined `element` to a primitive |
| `invalid_duration` | `useTween` duration is zero, negative, or NaN        |
| `ticker_stopped`   | Calling `start`/`resume` on a stopped ticker         |
| `missing_context`  | `<Swap.State>` used outside `<Swap>`                 |

## Relationship to View Transitions

`phase` doesn't wrap React's View Transition API, and it doesn't need to. The two compose cleanly. Reach for `<ViewTransition>` when you animate between committed UI states like route changes and shared-element morphs, and reach for `Presence`, `Swap`, and the frame loops for component-local lifecycle on stable React. A `phase` loop keeps ticking inside a view-transitioned subtree without conflict.

## Bundle Size

Minimal footprint is a core promise (see [Why phase](#why-phase)). Every export is individually measured with [Size Limit](https://github.com/ai/size-limit) and budgeted in CI. Sizes reflect minified + brotli-compressed bytes.

> Regenerate with `pnpm size:readme`.

<!-- SIZE-TABLE:START -->

| Export                 | Size (min+brotli) |
| ---------------------- | ----------------: |
| **Core**               |                   |
| `createTicker`         |             764 B |
| `createSight`          |             889 B |
| `createLifecycle`      |           1.39 kB |
| `createLoop`           |           2.48 kB |
| `createScrollProgress` |             782 B |
| `createRenderState`    |             425 B |
| `whenIdle`             |             334 B |
| `prefersReducedMotion` |             101 B |
| **Ease**               |                   |
| `ease (all)`           |             210 B |
| **React**              |                   |
| `useLoop`              |           2.73 kB |
| `useLifecycle`         |           1.54 kB |
| `useSight`             |           1.02 kB |
| `useCanvas`            |           3.19 kB |
| `useTween`             |             615 B |
| `usePresence`          |             594 B |
| `useScrollProgress`    |             841 B |
| `useSize`              |             265 B |
| `useContainerQuery`    |             344 B |
| `useMediaQuery`        |             245 B |
| `useSyncedRef`         |              22 B |
| `useStableCallback`    |              39 B |
| `Presence`             |             746 B |
| `WhenVisible`          |           1.24 kB |
| `WhenIdle`             |             499 B |
| `Defer`                |             103 B |
| `useIdle`              |             319 B |
| `useWhenIdle`          |             348 B |
| `useRenderState`       |             458 B |
| `Swap`                 |           1.13 kB |

<!-- SIZE-TABLE:END -->

## Agent skill

`phase` ships with an [agent skill](skills/phase) that teaches AI coding agents to implement the API correctly, follow performant-animation best practices, and audit existing code to recommend the cheapest sufficient approach (CSS-only, minimal JS, `phase`, or a heavier library).

Install it three ways:

```bash
# skills.sh
npx skills add vercel-labs/phase --skill phase
```

Or copy `skills/phase/` into your project's `.agents/skills/phase/` and reference its `SKILL.md` from your `AGENTS.md`, or download [`skills/phase/dist/phase-skill.zip`](skills/phase/dist/phase-skill.zip) and unzip it into your skills directory.
