<p align="center">
  <img src=".github/assets/phase-header.png" alt="phase" />
</p>

# ▲ phase

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

Phase is a lightweight, lifecycle-aware UI performance layer for the web. It includes tools & guidance to optimize render performance, build performant animations, and manage layout and off-screen resources.

## Why phase

You can't accidentally tank the main thread, leak an observer, jank on scroll, or ignore reduced motion. The hard parts are handled for you, so the slow path isn't even reachable:

- **Pauses when unseen.** Off-screen or in a background tab, work stops and CPU drops to zero.
- **Respects reduced motion by default.** Accessibility is built in, not an opt-in.
- **Never forces a reflow.** No `getBoundingClientRect`, no layout thrash, anywhere in the package.
- **Zero re-renders from the frame loop.** Per-frame work writes to refs and the DOM, never React state.
- **Frame-locked shared clock.** Every animation on the page reads one clock, so nothing drifts out of sync.
- **Renders only what matters.** Skip painting off-screen content, mount non-critical UI when idle.

Each guarantee is a [tested invariant](#guarantees), not an aspiration. Every export stays [sub-kilobyte to a few kilobytes](#bundle-size).

## Table of contents

- [Install](#install)
- [Getting started](#getting-started)
- [Philosophy](#philosophy)
- [Scope](#scope)
- [Entry points](#entry-points)
- [Core API](#core-api)
  - [createLoop](#createloop)
  - [createTicker](#createticker)
  - [createSight](#createsight)
  - [createLifecycle](#createlifecycle)
  - [createScrollProgress](#createscrollprogress)
  - [createScroll](#createscroll)
  - [createThrottle](#createthrottle)
  - [createDebounce](#createdebounce)
  - [createRenderState](#createrenderstate)
  - [createDevicePixelRatio](#createdevicepixelratio)
  - [createMutation](#createmutation)
  - [createPointer](#createpointer)
  - [whenIdle](#whenidle)
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
  - [useScroll](#usescroll)
  - [useThrottledCallback](#usethrottledcallback)
  - [useDebouncedCallback](#usedebouncedcallback)
  - [useMutation](#usemutation)
  - [usePointer](#usepointer)
  - [Observation and utility hooks](#observation-and-utility-hooks)
- [React components](#react-components)
  - [How animations work](#how-animations-work)
  - [Presence](#presence)
  - [WhenVisible](#whenvisible)
  - [Swap](#swap)
- [Rendering](#rendering)
  - [Defer](#defer)
  - [WhenIdle](#whenidle-1)
  - [useIdle](#useidle)
  - [useWhenIdle](#usewhenidle)
  - [useRenderState](#userenderstate)
- [Guarantees](#guarantees)
- [Errors](#errors)
- [Relationship to View Transitions](#relationship-to-view-transitions)
- [Bundle size](#bundle-size)
- [Agent skill](#agent-skill)

## Install

```bash
pnpm add phase
```

## Getting started

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

Each of those signals is also a CPU and battery decision. Animating while off-screen, ignoring reduced motion, or running after unmount is what burns cycles and causes jank. `phase` composes them once, correctly, instead of leaving each call site to get the conjunction right.

Safe behavior is automatic. Visibility awareness, reduced motion, observer cleanup, and delta clamping are defaults, not opt-ins. Bypassing reduced motion requires an explicit `reducedMotion: 'ignore'` in the diff.

## Scope

`phase` composes signals (visibility, focus, reduced motion, frame budget) into a coherent lifecycle with a reason for every state transition.

**Handles:** lifecycle state, timing, visibility, scroll visibility-ratio, reduced motion, observer pooling, quality signals, frame loops.

**Does not handle:** spring physics, gesture systems, declarative keyframe orchestration. Reach for a dedicated library (e.g. `motion`) when you need those.

This narrow scope is deliberate. Shipping only the performance-critical plumbing (and nothing else) is what keeps every export [sub-kilobyte to a few kilobytes](#bundle-size).

### Admission criteria

Every export must pass all four:

1. **Wraps a browser API that is easy to misuse** and causes measurable perf regressions without careful handling.
2. **Manages a lifecycle** (browser: visibility-pausing, reduced-motion, observer pooling; render: preventing re-renders, stable identities; CSS: containment state).
3. **Makes the safe path shorter than the raw path.** The primitive is less code and less error-prone than the browser API directly.
4. **Stays individually lean.** Every export is measured and budgeted in `.size-limit.json`. CI rejects regressions. Every byte must justify itself.

If a gap fails any criterion, phase closes it in the [skill](#agent-skill) (audit rules, recipes, scanner signals) rather than shipping code.

### Export taxonomy

| Category    | What it covers                               | Examples                                            |
| ----------- | -------------------------------------------- | --------------------------------------------------- |
| Timing      | Frame clocks and animation loops             | createLoop, useLoop, useCanvas, useTween            |
| Observation | Reactive wrappers around browser observers   | useSight, useSize, useScrollProgress, useMediaQuery |
| Lifecycle   | Activation signals composed from IO+MQL+rIC  | useLifecycle, useIdle, useWhenIdle                  |
| Composition | Mount/unmount orchestration with transitions | Presence, Swap, WhenVisible, WhenIdle, Defer        |
| Math        | Pure easing and interpolation functions      | lerp, clamp, easeOutCubic                           |
| Utility     | React ref/callback patterns for phase users  | useSyncedRef, useStableCallback                     |

## Entry points

| Import        | Contents                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| `phase`       | Framework-agnostic timing, observation, lifecycle, scheduling, math, and errors |
| `phase/ease`  | Easing functions and math utilities only                                        |
| `phase/react` | React hooks and components                                                      |

Each entry point is independently tree-shakeable. Importing `phase/ease` in a server component pulls zero browser APIs.

## Core API

### createLoop

The main primitive. Composes a ticker, visibility observer, and reduced-motion listener into a lifecycle-aware animation loop.

```ts
import { createLoop } from 'phase';

const loop = createLoop({
  target: el,
  onTick: (frame) => {
    // frame.time    — browser rAF timestamp
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

Read `loop.quality` and `loop.qualityReason` to adapt rendering (fewer particles, lower-fidelity shaders, skip non-essential visual passes).

#### The `degraded` option

Controls the loop's response when quality degrades. Same three-value pattern as `reducedMotion`.

| Value        | Behavior                                             | Use case                                            |
| ------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `'throttle'` | Cap FPS (default 30, configurable via `degradedFps`) | Most animations. Still runs, only slower            |
| `'pause'`    | Pause the loop entirely                              | Heavy canvas/WebGL. If it can't run well, don't run |
| `'ignore'`   | Keep running at full quality                         | Critical UI that must never degrade                 |

```ts
createLoop({
  target: el,
  onTick: draw,
  degraded: 'throttle', // default
  degradedFps: 20, // only accepted when degraded is 'throttle'
});
```

#### Loop options

| Option          | Type                                | Default      | Description                                                   |
| --------------- | ----------------------------------- | ------------ | ------------------------------------------------------------- |
| `target`        | `Element \| Document`               | required     | Element to observe for visibility, or `document` for the page |
| `onTick`        | `(frame: FrameState) => void`       | required     | Called each frame while running                               |
| `fps`           | `number`                            | —            | Cap frames per second                                         |
| `reducedMotion` | `'pause' \| 'complete' \| 'ignore'` | `'pause'`    | Behavior when user prefers reduced motion                     |
| `degraded`      | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'` | Behavior when quality degrades                                |
| `degradedFps`   | `number`                            | `30`         | FPS cap in degraded throttle mode                             |
| `onPhaseChange` | `(phase, reason) => void`           | —            | Called on every phase transition                              |

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

All tickers share a single `requestAnimationFrame` loop. Every subscriber receives the same browser-supplied timestamp each frame, so independent animations stay in visual sync.

#### Ticker phases

| Phase     | Meaning                  | Transitions                 |
| --------- | ------------------------ | --------------------------- |
| `idle`    | Created, not started     | → `running` via `start()`   |
| `running` | Actively ticking         | → `paused` via `pause()`    |
| `paused`  | Suspended, resumable     | → `running` via `resume()`  |
| `stopped` | Terminal, cannot restart | via `stop()` from any state |

### createSight

Answers one question: is this element visible right now? Combines `document.visibilitychange`, `pageshow` (bfcache restore), and `IntersectionObserver` into a single phase.

```ts
import { createSight } from 'phase';

const sight = createSight({
  target: el,
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
  target: canvas,
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

> **Visibility ratio, not scroll offset.** This reports `intersectionRatio` (how much of an element is visible in the viewport), which plateaus for tall elements once they fill it. For a scroll container's _own_ offset (scrollbars, carousels, or the page via `target: 'page'` on the hook) use [`createScroll`](#createscroll); for CSS-declarative scroll-linked animation use the native `ScrollTimeline` API; for spring/gesture scroll use `motion`.

```ts
import { createScrollProgress } from 'phase';

const progress = createScrollProgress({
  target: el,
  onProgress: (ratio) => {
    el.style.opacity = String(ratio);
  },
});

// progress.ratio === 0.65 (synchronous read)

// cleanup:
progress.stop();
```

The `steps` option controls threshold granularity. Default `20` generates 21 evenly-spaced thresholds (0%, 5%, 10%, …, 100%). Multiple instances with the same `steps` share a single IO, adding zero extra observers.

#### ScrollProgress options

| Option       | Type                          | Default  | Description                                    |
| ------------ | ----------------------------- | -------- | ---------------------------------------------- |
| `target`     | `Element \| Document`         | required | Element to observe, or `document` for the page |
| `onProgress` | `(ratio: number) => void`     | required | Called at each threshold crossing              |
| `steps`      | `number`                      | `20`     | Number of evenly-spaced thresholds             |
| `root`       | `Element \| Document \| null` | —        | IO root element                                |
| `rootMargin` | `string`                      | —        | IO root margin                                 |

### createScroll

Tracks a scroll container's offset and progress. Reads `scrollLeft`/`scrollTop` once per rAF frame and reads the reflow-heavy geometry (`scrollWidth`/`clientWidth`) only on a coalesced resize or an explicit `measure()`, never on the scroll path. Auto-pauses off-screen via the shared IntersectionObserver pool. This is to `scroll` + `scrollWidth` what `createPointer` is to `pointermove` + `getBoundingClientRect`.

> **Scroll offset, not visibility ratio.** This reports the element's own scroll position (for scrollbars, carousels, position indicators). For _how much of an element is in the viewport_, use [`createScrollProgress`](#createscrollprogress); for CSS-declarative scroll-linked animation, use the native `ScrollTimeline` API.

```ts
import { createScroll } from 'phase';

const scroll = createScroll({
  target: viewport,
  onScroll: (s) => {
    // thumb CSS needs `transform-origin: left` so scaleX anchors to the track start
    thumb.style.transform = `translateX(${s.progressX * (1 - s.visibleX) * 100}%) scaleX(${s.visibleX})`;
    prevButton.disabled = s.x <= 1;
    nextButton.disabled = s.x >= s.maxX - 1;
  },
});

// scroll.state.progressX === 0.5 (synchronous read)

// after mutating scrollable content:
scroll.measure();

// cleanup:
scroll.stop();
```

`onScroll` receives the same `ScrollState` object every frame (mutated in place, zero per-frame allocations): `x`, `y`, `maxX`, `maxY`, `progressX`, `progressY`, and the visible fractions `visibleX`/`visibleY` (`clientWidth / scrollWidth`, i.e. a scrollbar thumb's `scaleX`). The `ResizeObserver` recomputes geometry on container resize; call `measure()` after content changes that alter `scrollWidth`.

#### Scroll options

| Option                | Type                           | Default   | Description                                        |
| --------------------- | ------------------------------ | --------- | -------------------------------------------------- |
| `target`              | `Element \| Document`          | required  | Scroll container, or `document` for the page       |
| `onScroll`            | `(state: ScrollState) => void` | required  | Called once per rAF frame with position + progress |
| `onPhaseChange`       | `(phase, reason) => void`      | —         | Called on phase transitions                        |
| `visibility`          | `'pause' \| 'ignore'`          | `'pause'` | Pause tracking when off-screen, or ignore          |
| `intersectionOptions` | `IntersectionObserverInit`     | —         | Forwarded to the visibility observer               |
| `signal`              | `AbortSignal`                  | —         | Stops the tracker when aborted                     |

The options type is `CreateScrollOptions` (`ScrollOptions` is a `lib.dom` global and must not be shadowed).

Pass `document` to track the page scroller. Offsets and geometry then come from `document.scrollingElement`, and since the page is never off-screen, `visibility: 'pause'` reacts to tab visibility alone and creates no `IntersectionObserver`. Use it for scroll progress bars, condensing headers, and scroll-to-top affordances instead of a bare `window` scroll listener.

### createThrottle

Frame-aligned, visibility-aware throttle for event-driven work below frame rate (socket emits, worker messaging, expensive recompute). Leading calls fire synchronously; a pending trailing call fires with the latest value on the first animation frame at or past `interval`. Nothing is scheduled while the trigger is idle or the document is hidden.

> **Event-driven, not a loop.** This fires on the trigger and idles otherwise. To cap a continuous render loop, use `fps` on [`createLoop`](#createloop). To think in rates, `interval: 1000 / 20` reads as "at most 20 per second".

```ts
import { createThrottle } from 'phase';

const throttle = createThrottle({
  callback: (state) => socket.emit('cursor', state.x, state.y),
  interval: 50,
});

const pointer = createPointer({ element, onPointer: throttle.call });

// throttle.flush()  fires a pending trailing call now
// throttle.cancel() discards it and resets the window
// cleanup:
throttle.stop();
```

When the document hides, a pending call is flushed with the latest value (default) or dropped per `hidden`. Calls made while hidden are recorded but fire nothing until the document is visible again.

#### Throttle options

| Option     | Type                                | Default   | Description                                   |
| ---------- | ----------------------------------- | --------- | --------------------------------------------- |
| `callback` | `(value: T) => void`                | required  | Called with the latest value passed to `call` |
| `interval` | `number`                            | required  | Minimum ms between invocations                |
| `edge`     | `'leading' \| 'trailing' \| 'both'` | `'both'`  | Which edges fire                              |
| `hidden`   | `'flush' \| 'drop'`                 | `'flush'` | Pending-call policy when the document hides   |
| `signal`   | `AbortSignal`                       | —         | Stops the throttle when aborted               |

### createDebounce

Visibility-aware trailing debounce: fires the callback with the latest value once `wait` ms pass without a new call. No timer runs while the document is hidden; the quiet period restarts on return. Use it for work that should wait out a burst, like reallocating canvas buffers after a resize stream settles.

```ts
import { createDebounce } from 'phase';

const debounce = createDebounce({
  callback: (size) => reallocateBuffers(size),
  wait: 250,
});

debounce.call({ width, height });

// cleanup:
debounce.stop();
```

Same surface as `createThrottle`: `flush()`, `cancel()`, a synchronous `pending` read, and terminal `stop()`.

#### Debounce options

| Option     | Type                 | Default   | Description                                   |
| ---------- | -------------------- | --------- | --------------------------------------------- |
| `callback` | `(value: T) => void` | required  | Called with the latest value passed to `call` |
| `wait`     | `number`             | required  | Quiet period in ms; each call restarts it     |
| `hidden`   | `'flush' \| 'drop'`  | `'flush'` | Pending-call policy when the document hides   |
| `signal`   | `AbortSignal`        | —         | Stops the debounce when aborted               |

### createRenderState

Reports whether the browser is rendering an element or skipping it under `content-visibility: auto`. Use it to pause raw work inside deferred content; `phase` loops already pause themselves.

```ts
import { createRenderState } from 'phase';

const renderState = createRenderState({
  target: el,
  onPhaseChange: (phase) => {
    if (phase === 'skipped') clock.pause();
    else clock.resume();
  },
});

renderState.stop();
```

It listens to `contentvisibilityautostatechange`, the browser's actual paint decision, without changing layout.

### createDevicePixelRatio

Tracks `devicePixelRatio` changes through a shared media-query subscription. Use it for framework-free canvas, WebGL, or worker renderers that own their buffer sizing.

```ts
import { createDevicePixelRatio } from 'phase';

const dpr = createDevicePixelRatio({
  onChange: (value) => renderer.setPixelRatio(Math.min(value, 2)),
});

// dpr.dpr is always current
dpr.stop();
```

`useCanvas` handles DPR automatically; use this primitive only when you own the renderer.

### createMutation

A lifecycle-aware `MutationObserver`: records are coalesced into one callback per animation frame, observation pauses off-screen by default, and teardown is explicit.

```ts
import { createMutation } from 'phase';

const mutation = createMutation({
  target: list,
  mutation: { childList: true },
  onMutations: (records) => syncItems(records),
});

mutation.stop();
```

Reserve it for structural or narrow attribute changes. For dimensions, use ResizeObserver-backed `useSize`; reading layout inside `onMutations` still forces a reflow.

### createPointer

Tracks pointer position relative to an element, batching high-frequency events into one callback and one bounds read per animation frame. It pauses when the element is off-screen.

```ts
import { createPointer } from 'phase';

const pointer = createPointer({
  target: surface,
  onPointer: (state) => {
    cursor.style.transform = `translate(${state.x}px, ${state.y}px)`;
  },
});

// pointer.state is always current
pointer.stop();
```

Use CSS `:hover` for hover state and a gesture library for drag physics. This primitive is for continuous element-relative coordinates.

### whenIdle

Runs one callback when the browser is idle, with a timeout fallback for browsers without `requestIdleCallback`. The returned function cancels pending work.

```ts
import { whenIdle } from 'phase';

const cancel = whenIdle(() => warmCache(), { timeout: 2000 });
cancel();
```

In React, use `useWhenIdle` for effects, `useIdle` for a boolean, or `WhenIdle` to mount a subtree.

### prefersReducedMotion

Returns `true` when reduced motion is enabled at the OS level. Use it to gate expensive setup or dynamic imports.

```ts
import { prefersReducedMotion } from 'phase';

if (!prefersReducedMotion()) {
  const { startParticleSystem } = await import('./particles');
  startParticleSystem(canvas);
}
```

All hooks and primitives consult this signal automatically. You only need it directly for conditional imports or setup logic.

## Easing and math

Pure functions with no browser APIs, side effects, or React. Safe in server components, build scripts, and tests.

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

All easing functions take a progress value (0–1) and return a curved progress value (0–1). They don't know about time, pixels, or anything else. They reshape a number.

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

| Need                                                                   | Use                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Check on-screen visibility                                             | `useSight` (visibility only)                                                                |
| Run a frame loop via `phase`                                           | `useLoop` (DOM) / `useCanvas` (canvas)                                                      |
| Pause/resume your own loop (WebGL, three.js, Web Worker)               | `useLifecycle` (active/paused signal)                                                       |
| Animate a single value in render output                                | `useTween`                                                                                  |
| Animate mount/unmount transitions                                      | `Presence` / `Swap` / `WhenVisible`                                                         |
| Skip painting off-screen content (keep in DOM)                         | `Defer`                                                                                     |
| Defer non-critical UI until the browser is idle                        | `WhenIdle` / `useIdle`                                                                      |
| Run a side effect or prefetch when idle                                | `useWhenIdle`                                                                               |
| Pause non-`phase` work inside a `Defer` subtree                        | `useRenderState`                                                                            |
| React to DOM mutations without synchronous callback storms             | `useMutation`                                                                               |
| Track element-relative pointer position without per-event layout reads | `usePointer`                                                                                |
| Track DPR for a renderer you own                                       | `useDevicePixelRatio`                                                                       |
| Check reduced motion for non-`phase` work                              | `usePrefersReducedMotion`                                                                   |
| Subscribe to scroll, size, or media values reactively                  | `useScrollProgress` / `useSize` / `useContainerQuery` / `useMediaQuery`                     |
| Scroll/size/visibility without re-renders?                             | Same hooks with a callback (`onProgress` / `onResize` / `onVisibilityChange`), read via ref |
| Rate-limit event-driven work (sockets, workers)                        | `useThrottledCallback`                                                                      |
| Run once after a burst settles (resize, typing)                        | `useDebouncedCallback`                                                                      |

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

const opacity = useTween({ to: isVisible ? 1 : 0, duration: 300 });
```

Use `useTween` for single values where the render is cheap (counters, progress bars, opacity). Use `useLoop` when animating many elements or doing canvas work, since per-frame `setState` doesn't scale.

Reduced motion default: `'complete'` checks the preference when a tween starts and jumps to the destination when needed. Set `reducedMotion: 'ignore'` to skip the preference read. The exported `TweenReducedMotion` type is `'complete' | 'ignore'`; finite tweens do not support `'pause'` because freezing between endpoints leaves the value incomplete.

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

Element visibility ratio as a 0–1 value. Wraps `createScrollProgress` with React lifecycle management. This is a _visibility_ fraction (how much of the element is on screen); for a scroll container's own _position_ (scrollbars, carousels) use [`useScroll`](#usescroll) instead. See the [note on scope](#createscrollprogress) for the full distinction.

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

Re-renders only at threshold crossings (~20 per full viewport traversal at default steps). `progress` is `0` before first observation.

### useScroll

Scroll offset and progress for a scroll container. Wraps `createScroll` with React lifecycle management. Position is delivered imperatively via `onScroll` (never per-frame state); only the phase (`tracking`/`paused`) is reactive. Mirrors `usePointer`.

```tsx
import { useRef } from 'react';
import { useScroll } from 'phase/react';

function Carousel({ children }) {
  // thumb uses `origin-left` so scaleX anchors to the track start
  const thumbRef = useRef<HTMLDivElement>(null);
  const { ref, measure } = useScroll<HTMLDivElement>({
    onScroll: (s) => {
      thumbRef.current?.style.setProperty(
        'transform',
        `translateX(${s.progressX * (1 - s.visibleX) * 100}%) scaleX(${s.visibleX})`,
      );
    },
  });

  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
    </div>
  );
}
```

Scrolling writes to the DOM directly with zero re-renders. Read the latest position on demand from `stateRef.current` (e.g. inside a `useLoop` tick), and call `measure()` after changing scrollable content.

### useThrottledCallback

Wraps `createThrottle` with React lifecycle management. Returns a stable-identity throttled function (with `flush()` and `cancel()` attached) that drops directly into any callback slot and always invokes the latest `callback`.

```tsx
import { usePointer, useThrottledCallback } from 'phase/react';

function LiveCursor() {
  const emit = useThrottledCallback(
    (s: PointerState) => socket.emit('cursor', { x: s.x, y: s.y }),
    { interval: 50 },
  );
  const { ref } = usePointer({ onPointer: emit });
  return <div ref={ref} />;
}
```

Unmount and option changes discard a pending trailing call. When the final value must land, flush in your own cleanup: `useEffect(() => () => emit.flush(), [emit])`.

### useDebouncedCallback

Wraps `createDebounce` with React lifecycle management. Same shape as `useThrottledCallback`, but fires once `wait` ms pass without a new call.

```tsx
import { useSize, useDebouncedCallback } from 'phase/react';

function SimulationCanvas() {
  const realloc = useDebouncedCallback(
    (size: Size) => reallocateBuffers(size),
    { wait: 250 },
  );
  const { ref } = useSize({ onResize: realloc });
  return <canvas ref={ref} />;
}
```

### useMutation

Wraps `createMutation` with ref management and automatic teardown. Mutation records stay imperative—delivered once per animation frame—while only infrequent `observing` / `paused` phase changes re-render.

```tsx
import { useMutation } from 'phase/react';

const { ref, phase } = useMutation({
  mutation: { childList: true },
  onMutations: (records) => syncItems(records),
});

return <ul ref={ref} data-observer-phase={phase} />;
```

Observation pauses off-screen by default. Set `visibility: 'ignore'` only for document-level coordination that must continue in the background.

### usePointer

Element-relative pointer tracking without per-event layout reads or per-frame React state. Position is delivered through `onPointer` and mirrored in `stateRef`; only enter/leave phase changes re-render.

```tsx
import { usePointer } from 'phase/react';

const { ref } = usePointer({
  onPointer: ({ x, y, active }) => {
    cursorRef.current?.style.setProperty(
      'transform',
      `translate(${x}px, ${y}px)`,
    );
    cursorRef.current?.toggleAttribute('data-active', active);
  },
});

return <div ref={ref}>{children}</div>;
```

Use it for custom cursors, canvas interaction, and tooltips—not simple hover or drag gestures.

### Observation and utility hooks

| Hook                      | Purpose                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `useSight`                | Element visibility as a phase. Pass `onVisibilityChange` for zero-re-render mode      |
| `useSize`                 | Element dimensions via shared ResizeObserver. Pass `onResize` for zero-re-render mode |
| `useContainerQuery`       | Breakpoint matching against element width                                             |
| `useScrollProgress`       | Element visibility ratio (0–1). Pass `onProgress` for zero-re-render mode             |
| `useMediaQuery`           | CSS media query subscription (shared MQL pool)                                        |
| `usePrefersReducedMotion` | Reactive reduced-motion preference for non-`phase` animation                          |
| `useDevicePixelRatio`     | Reactive DPR for renderers outside `useCanvas`                                        |
| `useSyncedRef`            | Ref always in sync with latest value                                                  |
| `useStableCallback`       | Stable-identity function that calls latest closure                                    |

`useSight`, `useSize`, and `useScrollProgress` each support a transient mode: pass a callback (`onVisibilityChange`, `onResize`, `onProgress`) and the hook delivers updates via callback with zero re-renders. The reactive state field is omitted from the return type so accessing it is a compile-time error. An always-current ref (`phaseRef`, `sizeRef`, `progressRef`) is available in both modes.

## React components

### How animations work

One CSS pattern covers enter and exit across `Presence`, `WhenVisible`, and `Swap`:

```tsx
className =
  'transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0';
```

No `motion-reduce:` class needed because reduced motion is handled automatically.

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

Reduced motion is automatic: `data-enter="animate"` is not stamped when reduced motion is preferred.

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

`phase` is the _when_ layer (when to animate, when to render, when to pause), built from one set of signals. Alongside `WhenVisible`, two helpers skip rendering work for off-screen content. They differ in how aggressively they skip and whether the content survives server rendering:

| Helper        | Defers                              | In DOM? | In SSR HTML? | Reach for it when                                  |
| ------------- | ----------------------------------- | ------- | ------------ | -------------------------------------------------- |
| `Defer`       | browser render (style/layout/paint) | yes     | yes          | content must stay crawlable but need not paint yet |
| `WhenIdle`    | React mount until idle              | no      | no           | non-critical UI that shouldn't block first paint   |
| `WhenVisible` | React mount until near viewport     | no      | no           | viewport-gated lazy loading / reveals              |

### Defer

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`, using pure CSS with no JS or observers. Children stay in the DOM and are server-rendered.

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="my-section">
  <ArticleSection />
</Defer>;

// Use `as` for semantic elements (no wrapper div needed)
<ul>
  {items.map((item) => (
    <Defer as="li" key={item.id} estimatedHeight="80px">
      <ItemContent item={item} />
    </Defer>
  ))}
</ul>;
```

| Prop              | Type                                         | Default    | Description                                                |
| ----------------- | -------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `as`              | `ElementType`                                | `'div'`    | HTML element to render (`'li'`, `'tr'`, `'section'`, etc.) |
| `estimatedHeight` | `string`                                     | `'1000px'` | Reserved size before first paint (any CSS length)          |
| ...rest           | `Omit<HTMLAttributes<HTMLElement>, 'style'>` | —          | Standard HTML attributes except `style` (use `className`)  |

`contain-intrinsic-size: auto <estimatedHeight>` reserves space, so there is no layout shift. The browser remembers the real size after first paint. `Defer` defers rendering only, not hydration or mounting. There is no `style` prop: the render-skip styles are encapsulated so they can't be overridden. Style the wrapper with `className`.

`content-visibility: auto` applies paint containment, which clips all overflow to the element's padding edge. Box shadows, negative margins, and positioned content that bleeds outside the boundary will be cut off. If your content needs to overflow, move it outside the `Defer` or skip `Defer` for that container.

**Animations inside a `Defer` keep running.** `content-visibility` skips paint, not JavaScript. `phase`'s own loops (`useLoop`, `useCanvas`, `useLifecycle`) already self-pause off-screen via their own visibility observer. For raw work (a hand-written `requestAnimationFrame` loop, `setInterval`), gate it with `useRenderState`.

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

Idle never fires during SSR, so `WhenIdle` children are absent from server HTML. Reserve it for non-critical content. For content that must be crawlable, use `Defer`. Reduced motion is automatic: `data-enter="animate"` is not stamped when reduced motion is preferred.

### useIdle

Returns `false`, then flips to `true` once the browser is idle. Use it when the idle signal belongs in render; use `WhenIdle` for a wrapper or `useWhenIdle` for an effect.

```tsx
import { useIdle } from 'phase/react';

const idle = useIdle({ timeout: 2000 });
return idle ? <SecondaryPanel /> : <Skeleton />;
```

Like `WhenIdle`, idle-gated content is absent from server HTML and should be non-critical.

### useWhenIdle

Runs a callback once when the browser is idle after mount (the effect-shaped counterpart to `useIdle`). Use it for side effects (prefetching a chunk, warming a cache) rather than rendering. Cancels on unmount and always calls the latest callback.

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

It replaces the common (and leak-prone) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])`. `useWhenIdle` handles cancellation and the SSR guard. Reach for `useIdle` instead when you need to render from the idle signal.

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

`useRenderState` only listens and reports. It has no layout effect, so it never breaks `Defer`'s no-layout-shift guarantee. You rarely need it for `phase` loops, which already self-pause off-screen.

## Guarantees

These are the performance invariants behind [Why phase](#why-phase). They are tested in CI, not aspirations.

### Zero per-frame allocations

`FrameState` is created once and mutated in place every frame. No objects, arrays, closures, template literals, or spread operators in the tick path, and no GC pressure at 60 fps.

### Strong pause

When paused, the ticker calls `cancelAnimationFrame` and stops scheduling entirely. Zero callbacks fire, zero CPU consumed. This is not the "weak pause" pattern of scheduling rAF and returning early.

### Zero forced reflows

No `getBoundingClientRect()`, `offsetWidth`, `scrollWidth`, or `getComputedStyle()` anywhere in the package. All dimensions come from ResizeObserver (async, compositor-aligned) and all visibility from IntersectionObserver.

### Zero React re-renders from the frame loop

The rAF loop never triggers a React re-render. All per-frame state lives in refs; `onTick` writes to refs or the DOM directly. Only `phase` changes trigger re-renders (infrequent lifecycle transitions).

### Frame-locked shared clock

All tickers share one `requestAnimationFrame` loop and receive the same browser-supplied timestamp each frame, keeping multiple animations on the same page in visual sync.

### Delta clamping

When a loop resumes after a pause, `frame.delta` is clamped to 40 ms. Animations resume from where they left off with no teleporting.

## Errors

Every error includes a machine-readable `code` and an actionable message.

```ts
import { PhaseError, isPhaseError } from 'phase';
```

| Code                 | Trigger                                             |
| -------------------- | --------------------------------------------------- |
| `server_context`     | Calling a browser-only primitive during SSR         |
| `no_target`          | Passing a null or undefined `target` to a primitive |
| `conflicting_target` | Passing both `ref` and `target` to a hook           |
| `invalid_duration`   | `useTween` duration is zero, negative, or NaN       |
| `ticker_stopped`     | Calling `start`/`resume` on a stopped ticker        |
| `missing_context`    | `<Swap.State>` used outside `<Swap>`                |

## Relationship to View Transitions

`phase` doesn't wrap React's View Transition API, and it doesn't need to. The two compose cleanly. Reach for `<ViewTransition>` when you animate between committed UI states like route changes and shared-element morphs, and reach for `Presence`, `Swap`, and the frame loops for component-local lifecycle on stable React. A `phase` loop keeps ticking inside a view-transitioned subtree without conflict.

## Bundle size

Minimal footprint is a core promise (see [Why phase](#why-phase)). Every export is individually measured with [Size Limit](https://github.com/ai/size-limit) and budgeted in CI. Sizes reflect minified + brotli-compressed bytes.

> Regenerate with `pnpm size:readme`.

<!-- SIZE-TABLE:START -->

| Export                    | Size (min+brotli) |
| ------------------------- | ----------------: |
| **Core**                  |                   |
| `createTicker`            |           1.02 kB |
| `createSight`             |           1.05 kB |
| `createLifecycle`         |           1.55 kB |
| `createLoop`              |           2.86 kB |
| `createScrollProgress`    |             895 B |
| `createRenderState`       |             490 B |
| `createDevicePixelRatio`  |             544 B |
| `createMutation`          |            1.2 kB |
| `createPointer`           |            1.3 kB |
| `createScroll`            |           1.61 kB |
| `createThrottle`          |             660 B |
| `createDebounce`          |             559 B |
| `whenIdle`                |             409 B |
| `prefersReducedMotion`    |             101 B |
| **Ease**                  |                   |
| `ease (all)`              |             210 B |
| **React**                 |                   |
| `useLoop`                 |           3.18 kB |
| `useLifecycle`            |           1.83 kB |
| `useSight`                |           1.36 kB |
| `useCanvas`               |           3.75 kB |
| `useMutation`             |           1.38 kB |
| `usePointer`              |           1.51 kB |
| `useScroll`               |           1.97 kB |
| `useThrottledCallback`    |             804 B |
| `useDebouncedCallback`    |             685 B |
| `useTween`                |             684 B |
| `usePresence`             |             591 B |
| `useScrollProgress`       |           1.03 kB |
| `useSize`                 |             430 B |
| `useContainerQuery`       |             389 B |
| `useMediaQuery`           |             246 B |
| `usePrefersReducedMotion` |             274 B |
| `useDevicePixelRatio`     |             230 B |
| `useSyncedRef`            |              22 B |
| `useStableCallback`       |              39 B |
| `Presence`                |             741 B |
| `WhenVisible`             |           1.61 kB |
| `WhenIdle`                |             596 B |
| `Defer`                   |              85 B |
| `useIdle`                 |             414 B |
| `useWhenIdle`             |             444 B |
| `useRenderState`          |             515 B |
| `Swap`                    |           1.12 kB |

<!-- SIZE-TABLE:END -->

## Agent skill

`phase` ships with an [agent skill](skills/phase) that teaches AI coding agents to implement the API correctly, follow performant-animation best practices, and audit existing code to recommend the cheapest sufficient approach (CSS-only, minimal JS, `phase`, or a heavier library).

Install it three ways:

```bash
# skills.sh
npx skills add vercel-labs/phase --skill phase
```

Or copy `skills/phase/` into your project's `.agents/skills/phase/` and reference its `SKILL.md` from your `AGENTS.md`, or download [`skills/phase/dist/phase-skill.zip`](skills/phase/dist/phase-skill.zip) and unzip it into your skills directory.

The audit scanner ships with the skill (no separate install needed). Ask your agent to audit your animation code and it runs `scripts/scan.mjs` for you, or run it standalone with `node <skill-dir>/scripts/scan.mjs <target-dir>`. See the [skill README](skills/phase/README.md#running-an-audit) for details.
