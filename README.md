<p align="center">
  <img src=".github/assets/phase-header.png" alt="phase" />
</p>

# ▲ phase

> **Status: Alpha.** APIs are evolving rapidly. Expect breaking changes.

Phase is a browser runtime performance toolkit for detecting and controlling avoidable browser work in animation, rendering, and loading.

## Use the scan tool

```bash
npx phase scan --diff origin/main --fail-on critical  # fail on new critical findings
npx phase scan src components                          # scan files or directories
npx phase explain setstate-in-raf                      # explain a finding and its fix
```

The scanner is deterministic, but every match still needs review. Use `--fail-on` to fail CI at a chosen severity. Commit a [baseline](skills/phase/README.md#scanner-cli) to keep existing findings from failing new pull requests.

## Agent skill

Install the phase skill to give a coding agent the runtime API references, performance rules, and audit procedure. It can build or audit animation, rendering, and loading code. For each task, it chooses the cheapest approach that meets the requirement: CSS, a browser API, minimal JavaScript, phase, another library, or no change.

```bash
npx skills add vercel-labs/phase --skill phase
```

To install it manually, copy `skills/phase/` to `.agents/skills/phase/` in your project, then reference `.agents/skills/phase/SKILL.md` from `AGENTS.md`.

The skill includes the audit scanner, so audits need no separate npm install. Agents run `scripts/scan.mjs` during an audit; you can also run it directly with `node <skill-dir>/scripts/scan.mjs <target-dir>`. See the [skill README](skills/phase/README.md#running-an-audit) for details.

### Copy-paste prompts

Point the skill at one animation, page, component family, or package. Replace the bracketed text in one of these prompts.

#### Build a production animation

```text
Use the phase skill to build [animation] in [component or file]. Make it
ready to ship and as performant as possible.
```

#### Optimize an existing animation

```text
I just built [animation] in [component or file]. Use the phase skill to make it as
performant as possible without changing how it looks or feels.
```

#### Audit a page or component set

```text
Use the phase skill to audit [page, route, or component set] for browser runtime
performance. Create a polished HTML report of the findings that I can share with
my team.
```

#### Assess a design system

```text
Use the phase skill to audit [design-system package or component family]. Create
a polished HTML report of the findings that I can share with my team.
```

## What ships

<!-- docs/positioning.md owns public framing; this table expands its toolkit parts into shipped artifacts. -->

| Part                        | Shipped as                                                                     | What it does                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Scan CLI                    | npm [`phase`](https://www.npmjs.com/package/phase)                             | Runs deterministic source scans from the terminal                                                   |
| Core runtime                | npm [`@usephase/core`](https://www.npmjs.com/package/@usephase/core)           | Provides framework-agnostic timing, observation, lifecycle, and scheduling APIs                     |
| React bindings              | npm [`@usephase/react`](https://www.npmjs.com/package/@usephase/react)         | Provides React hooks and components built on the core runtime                                       |
| Migration codemods          | npm [`@usephase/codemod`](https://www.npmjs.com/package/@usephase/codemod)     | Runs versioned migrations for phase packages                                                        |
| [Agent skill](#agent-skill) | skills.sh [vercel-labs/phase/phase](https://skills.sh/vercel-labs/phase/phase) | Audits browser runtime code, checks each candidate in context, and recommends the cheapest safe fix |
| GitHub Action               | repository [`action/`](action/README.md)                                       | Runs the same deterministic scanner in CI                                                           |

The skill, CLI, and Action use the same scanner. Audits do not require the runtime libraries. Depending on the code, the right recommendation may be CSS, a browser API, a framework feature, a runtime library, or no change.

## Runtime library principles

The runtime libraries put lifecycle decisions in the primitives that need them:

- **Treat visibility and reduced motion as lifecycle inputs.** Phase-managed loops use element visibility, document visibility, and user preference to decide whether to run.
- **Share scheduling and observation.** Compatible tickers use one frame clock, and observer-backed primitives reuse browser observers when they can provide the same data.
- **Keep the runtime frame path outside React and layout.** Phase delivers frame data without a React state update or synchronous layout read on each frame. Application callbacks remain responsible for their own work.
- **Delay non-critical rendering.** `Defer` can skip off-screen paint; `WhenVisible` and `WhenIdle` can delay mounting.

The [Guarantees](#guarantees) section documents the scheduler, observation, and React frame-loop contracts. CI checks a [bundle-size budget](#bundle-size) for every export; individual exports range from less than 1 kB to a few kilobytes.

## Install the runtime libraries

```bash
pnpm add @usephase/core @usephase/react
```

## Table of contents

- [Getting started](#getting-started)
- [Choosing an API](#choosing-an-api)
- [Guarantees](#guarantees)
- [Core API](#core-api)
- [React API](#react-api)
- [Errors](#errors)
- [Compatibility and SSR](#compatibility-and-ssr)
- [Bundle size](#bundle-size)

## Getting started

```tsx
import { useRef } from 'react';
import { useLoop } from '@usephase/react';

interface OrbitProps {
  radius: number;
}

function Orbit({ radius }: OrbitProps) {
  const ref = useRef<HTMLDivElement>(null);
  const speed = 1; // radians per second

  useLoop({
    ref,
    onTick: (frame) => {
      const angle = (frame.elapsed / 1000) * speed;
      ref.current?.style.setProperty(
        'transform',
        `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`,
      );
    },
  });

  return <div ref={ref} className="dot" />;
}
```

`useLoop` starts automatically. By default, it pauses when the element leaves the viewport, the document enters a background tab, or the user prefers reduced motion. Paused time does not advance `frame.elapsed`, and unmounting stops the loop.

## Choosing an API

Prefer CSS or a browser API when it can express the behavior without a JavaScript frame loop. Use a dedicated animation library for spring physics, gestures, or declarative timeline orchestration.

| Need                                                | React                                          | Core                                                                 |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Managed DOM frame loop                              | `useLoop`                                      | `createLoop`                                                         |
| Activation signal for a renderer or loop you own    | `useLifecycle`                                 | `createLifecycle`                                                    |
| DPR-aware 2D canvas loop                            | `useCanvas`                                    | Compose `createLoop` and `createDevicePixelRatio` with your renderer |
| Finite value in React render output                 | `useTween`                                     | No direct equivalent                                                 |
| Element or page visibility                          | `useSight`                                     | `createSight`                                                        |
| Visible fraction of an element                      | `useScrollProgress`                            | `createScrollProgress`                                               |
| Scroll-container offset and progress                | `useScroll`                                    | `createScroll`                                                       |
| Element dimensions                                  | `useSize`                                      | No public core equivalent                                            |
| Size breakpoint                                     | `useContainerQuery`                            | No public core equivalent                                            |
| Media-query match                                   | `useMediaQuery`                                | No public core equivalent                                            |
| Element-relative pointer coordinates                | `usePointer`                                   | `createPointer`                                                      |
| Batched DOM mutation records                        | `useMutation`                                  | `createMutation`                                                     |
| Event throttle or debounce                          | `useThrottledCallback`, `useDebouncedCallback` | `createThrottle`, `createDebounce`                                   |
| Device-pixel ratio                                  | `useDevicePixelRatio`                          | `createDevicePixelRatio`                                             |
| `content-visibility` render state                   | `useRenderState`                               | `createRenderState`                                                  |
| Mount and unmount transitions                       | `Presence`, `Swap`, `usePresence`              | No public core equivalent                                            |
| Mount near the viewport                             | `WhenVisible`                                  | `createSight` plus application mounting                              |
| Skip off-screen rendering while keeping server HTML | `Defer`                                        | Use `content-visibility` directly                                    |
| Mount or run work when idle                         | `WhenIdle`, `useIdle`, `useWhenIdle`           | `whenIdle`                                                           |
| Reduced-motion preference                           | `usePrefersReducedMotion`                      | `prefersReducedMotion`                                               |

`useSight` reports visibility. `useLifecycle` combines visibility, reduced motion, and manual pause into an activation decision. Use `useLifecycle` to gate motion and `useSight` to gate content or observation.

## Guarantees

### Lifecycle state

Lifecycle APIs expose a `phase` and, when the cause matters, a `phaseReason`. For example, a loop may be `paused` because of `sight`, `reduced-motion`, or degraded quality. These values describe library state; application callbacks remain responsible for their own work.

### Frame timing

`FrameState` contains:

| Field     | Meaning                                   |
| --------- | ----------------------------------------- |
| `time`    | Browser `requestAnimationFrame` timestamp |
| `delta`   | Milliseconds to advance this callback     |
| `elapsed` | Sum of delivered deltas since start       |
| `frame`   | Delivered frame count                     |

The same `FrameState` object is mutated and reused. Read its fields inside `onTick`; do not retain the object. Paused time does not advance `elapsed`. Delayed `delta` values are capped at 40ms without an FPS limit, or one configured interval plus 40ms with a limit.

Tickers using the same phase clock protocol in one JavaScript global share one browser frame and timestamp. Pausing removes a ticker from that clock. If no ticker or queued input callback remains, phase cancels the pending browser frame.

### React rendering

`useLoop` and `useCanvas` do not update React state for each frame. Write repeated values to refs, the DOM, or canvas inside frame callbacks. Calling `setState` from an application callback can still render on every frame.

### Observation and layout

Compatible visibility, size, media-query, and DPR subscriptions share browser observers. Pointer movement and scroll events are coalesced to frame delivery. `createPointer` reads one bounding box per dirty frame. `createScroll` reads offsets during scroll delivery and refreshes heavier geometry on attachment, resize, or `measure()`.

Pooling depends on compatible observer options. It does not mean an observer already exists for every call.

## Core API

Import browser primitives from `@usephase/core`. Import pure easing and math functions from `@usephase/core/ease`. `@usephase/core/internal` is reserved for `@usephase/*` bindings and is not an application API.

### Lifecycle and frame loops

#### createLoop

Creates a managed frame loop that responds to element visibility, document visibility, reduced motion, focus, and sustained frame pressure.

```ts
import { createLoop } from '@usephase/core';

const loop = createLoop({
  target: el,
  onTick: (frame) => {
    el.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
  },
});

// Starts automatically. Call stop() for terminal cleanup.
loop.stop();
```

| Option                | Type                                | Default         | Description                                                    |
| --------------------- | ----------------------------------- | --------------- | -------------------------------------------------------------- |
| `target`              | `Element \| Document`               | Required        | Element visibility, or document visibility for page-level work |
| `onTick`              | `(frame: FrameState) => void`       | Required        | Called for each delivered frame                                |
| `fps`                 | `number`                            | Display cadence | Positive finite FPS cap                                        |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`       | Reduced-motion behavior                                        |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'`    | Response to degraded quality                                   |
| `degradedFps`         | `number`                            | `30`            | Cap used by degraded throttle mode                             |
| `intersectionOptions` | `IntersectionObserverInit`          | None            | Visibility observer options; ignored for `document`            |
| `start`               | `'auto' \| 'manual'`                | `'auto'`        | Start during construction or wait for `start()`                |
| `onPhaseChange`       | `(phase, reason) => void`           | None            | Called after a phase transition                                |
| `signal`              | `AbortSignal`                       | None            | Stops the loop when aborted                                    |

The current type accepts `reducedMotion: 'complete'`, but an open-ended loop has no end state to synthesize. It currently follows the non-pausing path. Use `'pause'` or `'ignore'` for loops and `useTween` for a finite value with a destination.

`loop.phase` is `idle`, `running`, `paused`, or `stopped`. `stop()` is terminal. `loop.quality` is independent from phase and reports `full` or `degraded`; `qualityReason` is `unfocused` or `frame-budget`. The degraded response can throttle, pause, or only report the signal. A lower base `fps` is never raised by `degradedFps`.

#### createTicker

Creates a low-level `requestAnimationFrame` loop without visibility or reduced-motion management.

```ts
import { createTicker } from '@usephase/core';

const ticker = createTicker({
  onTick: draw,
  fps: 30,
});

ticker.start();
ticker.pause();
ticker.resume();
ticker.setFps(60);
ticker.stop();
```

`fps` is optional and must be positive and finite. `setFps(undefined)` removes the cap without resetting frame count or elapsed time. Calling `start()`, `resume()`, or `setFps()` after `stop()` throws `ticker_stopped`.

#### createLifecycle

Combines visibility, reduced motion, and manual pause into an activation signal for a loop or renderer you own.

```ts
import { createLifecycle } from '@usephase/core';

const lifecycle = createLifecycle({
  target: canvas,
  onPhaseChange: (phase, reason) => {
    if (phase === 'active') renderer.start();
    else renderer.stop();
  },
});

lifecycle.pause();
lifecycle.resume();
lifecycle.stop();
```

| Option                | Type                       | Default   | Description                                                    |
| --------------------- | -------------------------- | --------- | -------------------------------------------------------------- |
| `target`              | `Element \| Document`      | Required  | Element visibility, or document visibility for page-level work |
| `reducedMotion`       | `'pause' \| 'ignore'`      | `'pause'` | Whether reduced motion pauses activation                       |
| `intersectionOptions` | `IntersectionObserverInit` | None      | Visibility observer options                                    |
| `start`               | `'auto' \| 'manual'`       | `'auto'`  | Start honoring signals during construction                     |
| `onPhaseChange`       | `(phase, reason) => void`  | None      | Called after a transition                                      |
| `signal`              | `AbortSignal`              | None      | Stops the lifecycle when aborted                               |

The phases are `idle`, `active`, `paused`, and `stopped`. Pause priority is reduced motion, visibility, then manual pause. `createLifecycle` does not schedule frames.

### Observation and input

#### createSight

Reports `visible`, `hidden`, or `unknown` from document visibility and element intersection.

```ts
const sight = createSight({
  target: element,
  intersectionOptions: { rootMargin: '200px' },
  onPhaseChange: (phase, reason) => {
    // React to visibility without polling.
  },
});

sight.stop();
```

`target` accepts an `Element` or `Document`. A document target follows document visibility and does not create an `IntersectionObserver`. Element calls with compatible observer options share an observer. `signal` can provide abort-based cleanup.

#### createScrollProgress

Reports an element's current `intersectionRatio`, from 0 to 1. This is visible fraction, not scroll offset.

```ts
const progress = createScrollProgress({
  target: element,
  onProgress: (ratio) => {
    element.style.opacity = String(ratio);
  },
});

console.log(progress.ratio);
progress.stop();
```

| Option       | Type                          | Default  | Description                                    |
| ------------ | ----------------------------- | -------- | ---------------------------------------------- |
| `target`     | `Element`                     | Required | Element whose visible fraction is observed     |
| `onProgress` | `(ratio: number) => void`     | Required | Called at threshold crossings                  |
| `steps`      | `number`                      | `20`     | Generates `steps + 1` evenly spaced thresholds |
| `root`       | `Element \| Document \| null` | Viewport | Intersection root                              |
| `rootMargin` | `string`                      | `'0px'`  | Intersection root margin                       |
| `signal`     | `AbortSignal`                 | None     | Stops observation when aborted                 |

Calls share an observer only when `steps`, `root`, and `rootMargin` resolve to compatible options.

#### createScroll

Tracks a scroll container's offsets, limits, progress, and visible fraction. Use `document` as the target for the page scroller.

```ts
const scroll = createScroll({
  target: viewport,
  onScroll: (state) => {
    progress.style.transform = `scaleX(${state.progressX})`;
  },
});

console.log(scroll.state.x, scroll.state.progressX);
scroll.measure();
scroll.stop();
```

`ScrollState` is reused and contains `x`, `y`, `maxX`, `maxY`, `progressX`, `progressY`, `visibleX`, and `visibleY`. Copy fields if they must outlive the callback.

| Option                | Type                           | Default   | Description                                |
| --------------------- | ------------------------------ | --------- | ------------------------------------------ |
| `target`              | `Element \| Document`          | Required  | Scroll container or page                   |
| `onScroll`            | `(state: ScrollState) => void` | Required  | Called once per eligible browser frame     |
| `onPhaseChange`       | `(phase, reason) => void`      | None      | Reports `tracking`, `paused`, or `stopped` |
| `visibility`          | `'pause' \| 'ignore'`          | `'pause'` | Disconnect while off-screen or continue    |
| `intersectionOptions` | `IntersectionObserverInit`     | None      | Visibility observer options                |
| `signal`              | `AbortSignal`                  | None      | Stops tracking when aborted                |

Geometry refreshes on attachment and resize. Call `measure()` after content changes that alter scrollable size.

#### createMutation

Wraps `MutationObserver`, coalesces records into one callback per browser frame, and pauses off-screen by default.

```ts
const mutation = createMutation({
  target: list,
  mutation: { childList: true },
  onMutations: syncItems,
});

mutation.stop();
```

Options are `target`, standard `mutation` settings, `onMutations`, optional `onPhaseChange`, `visibility`, `intersectionOptions`, and `signal`. Pausing disconnects the observer, so mutations that occur while paused are not replayed.

#### createPointer

Reports pointer coordinates relative to an element. Move events are batched into one callback and one bounding-box read per dirty frame.

```ts
const pointer = createPointer({
  target: surface,
  onPointer: ({ x, y, active }) => {
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    cursor.hidden = !active;
  },
});

pointer.stop();
```

Options are `target`, `onPointer`, optional `onPhaseChange`, `visibility`, `intersectionOptions`, and `signal`. Use CSS `:hover` for hover styling and a gesture library for drag behavior.

#### createRenderState

Reports `rendered` or `skipped` from `contentvisibilityautostatechange` without reading layout.

```ts
const renderState = createRenderState({
  target: element,
  onPhaseChange: (phase) => {
    if (phase === 'skipped') clock.pause();
    else clock.resume();
  },
});

renderState.stop();
```

Options are `target`, optional `onPhaseChange`, and `signal`. Where the event is unsupported, the phase remains `rendered`.

#### createDevicePixelRatio

Tracks `devicePixelRatio` changes through a shared media-query subscription.

```ts
const dpr = createDevicePixelRatio({
  onChange: (value) => renderer.setPixelRatio(Math.min(value, 2)),
});

renderer.setPixelRatio(Math.min(dpr.dpr, 2));
dpr.stop();
```

The options are `onChange` and optional `signal`. Read `dpr.dpr` for the current value.

### Scheduling

#### createThrottle

Creates an event-driven, frame-aligned throttle. It schedules work only after `call()` receives a value.

```ts
const throttle = createThrottle({
  callback: (state) => socket.emit('cursor', state),
  interval: 50,
});

throttle.call(state);
throttle.flush();
throttle.cancel();
throttle.stop();
```

| Option     | Type                                | Default   | Description                                 |
| ---------- | ----------------------------------- | --------- | ------------------------------------------- |
| `callback` | `(value: T) => void`                | Required  | Receives the latest value                   |
| `interval` | `number`                            | Required  | Minimum milliseconds between calls          |
| `edge`     | `'leading' \| 'trailing' \| 'both'` | `'both'`  | Invocation edges                            |
| `hidden`   | `'flush' \| 'drop'`                 | `'flush'` | Pending-call policy when the document hides |
| `signal`   | `AbortSignal`                       | None      | Stops the throttle when aborted             |

A pending trailing call fires on the first browser frame at or after `interval`. When the document becomes hidden, the existing pending call is flushed or dropped according to `hidden`. Calls made while already hidden are retained until visibility returns.

#### createDebounce

Creates a trailing debounce that restarts its quiet period after each `call()`.

```ts
const debounce = createDebounce({
  callback: reallocateBuffers,
  wait: 250,
});

debounce.call(size);
debounce.stop();
```

Options are `callback`, `wait`, optional `hidden` (`flush` by default), and optional `signal`. The returned object also exposes `flush()`, `cancel()`, `pending`, and terminal `stop()`.

#### whenIdle

Runs one callback through `requestIdleCallback`. If that API is unavailable, it uses a near-immediate task. The returned function cancels pending work.

```ts
const cancel = whenIdle(() => warmCache(), { timeout: 2000 });
cancel();
```

Options are optional `timeout` and `signal`. `whenIdle` is browser-only and throws `server_context` during SSR.

#### prefersReducedMotion

Returns the current `prefers-reduced-motion: reduce` match. It returns `false` when `matchMedia` is unavailable.

```ts
if (!prefersReducedMotion()) {
  const { startParticleSystem } = await import('./particles');
  startParticleSystem(canvas);
}
```

Use this snapshot when the preference changes which code should load or initialize. Managed animation and lifecycle APIs already apply their own reduced-motion behavior.

### Easing and math

These functions have no browser dependencies and are safe in server components, build scripts, and tests.

```ts
import {
  clamp,
  clamp01,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutQuart,
  inverseLerp,
  lerp,
  linear,
  remap,
} from '@usephase/core/ease';
```

| Function                         | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `easeOutCubic`                   | Fast start with smooth deceleration                        |
| `easeOutQuart`                   | Sharper deceleration                                       |
| `easeOutBack`                    | Overshoot and return; accepts an optional overshoot amount |
| `easeInOutCubic`                 | Symmetric acceleration and deceleration                    |
| `linear`                         | Identity function                                          |
| `clamp(value, min, max)`         | Constrain a value to a range                               |
| `clamp01(value)`                 | Constrain a value to 0 through 1                           |
| `lerp(start, end, progress)`     | Interpolate between two values                             |
| `inverseLerp(start, end, value)` | Calculate progress within a range                          |
| `remap(options)`                 | Map a value from one range to another                      |

Easing functions accept progress as a number. Most return values between 0 and 1 for inputs in that range; `easeOutBack` intentionally exceeds 1 during its overshoot.

```ts
const progress = clamp01(elapsed / duration);
const value = lerp(start, end, easeOutCubic(progress));
```

## React API

Import hooks and components from `@usephase/react`. The entry point is a client boundary. Observer and media-query hooks use documented initial values during server rendering and establish browser subscriptions in effects.

### Animation and lifecycle

`useLoop` and `useCanvas` expose quality through React state. In the current binding, a quality-only transition does not trigger a render. Use core `createLoop` when synchronous quality reads are required.

#### useLoop

Wraps `createLoop` with ref management, the latest React callback, and teardown on unmount.

```tsx
import { useRef } from 'react';
import { useLoop } from '@usephase/react';

function MovingBox() {
  const ref = useRef<HTMLDivElement>(null);

  useLoop({
    ref,
    onTick: (frame) => {
      ref.current?.style.setProperty(
        'transform',
        `translateX(${frame.elapsed * 0.1}px)`,
      );
    },
  });

  return <div ref={ref} />;
}
```

| Option                | Type                                | Default         | Description                                                                  |
| --------------------- | ----------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `ref`                 | `RefObject<T \| null>`              | Returned ref    | Element to observe                                                           |
| `target`              | `'page'`                            | None            | Use document visibility instead of an element; cannot be combined with `ref` |
| `onTick`              | `(frame: FrameState) => void`       | Required        | Current callback for each delivered frame                                    |
| `fps`                 | `number`                            | Display cadence | Positive finite FPS cap                                                      |
| `enabled`             | `boolean`                           | `true`          | Tear down and report `idle` when false                                       |
| `reducedMotion`       | `'pause' \| 'complete' \| 'ignore'` | `'pause'`       | Same current behavior as `createLoop`                                        |
| `degraded`            | `'throttle' \| 'pause' \| 'ignore'` | `'throttle'`    | Quality response                                                             |
| `degradedFps`         | `number`                            | `30`            | Degraded throttle cap                                                        |
| `intersectionOptions` | `IntersectionObserverInit`          | None            | Visibility options                                                           |

Returns `ref`, `phase`, `phaseReason`, `quality`, and `qualityReason`. The frame callback sees current props and state without rebuilding the loop.

#### useLifecycle

Returns the activation decision for a renderer or loop managed by application code.

```tsx
import { useEffect } from 'react';
import { useLifecycle } from '@usephase/react';

function Hero() {
  const { ref, isActive } = useLifecycle();

  useEffect(() => {
    if (isActive) renderer.start();
    else renderer.stop();
    return () => renderer.stop();
  }, [isActive]);

  return <canvas ref={ref} />;
}
```

Options include `ref` or `target: 'page'`, `reducedMotion` (`'pause'` by default), `paused` (`false`), `enabled` (`true`), `intersectionOptions`, and `onPhaseChange`. Returns `ref`, `phase`, `phaseReason`, and `isActive`.

#### useCanvas

Creates a managed 2D canvas loop with container sizing and DPR updates.

```tsx
import { useRef } from 'react';
import { useCanvas } from '@usephase/react';

function CanvasScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useCanvas({
    containerRef,
    canvasRef,
    draw: (ctx, frame, size) => {
      ctx.clearRect(0, 0, size.width, size.height);
      // ctx is already scaled for devicePixelRatio; draw in CSS pixels
    },
  });

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

Required options are `containerRef`, `canvasRef`, and `draw`. Optional controls are `fps`, `enabled` (`true`), `reducedMotion` (`'pause'`), `degraded` (`'throttle'`), and `degradedFps` (`30`). Returns `restart`, `phase`, `phaseReason`, `quality`, and `qualityReason`.

The hook uses `devicePixelContentBoxSize` when available and otherwise sizes the buffer from CSS dimensions and current DPR. It skips `draw` while the 2D context is lost and resumes after restoration. Call `restart()` after an external renderer configuration change that requires teardown and setup.

#### useTween

Animates a finite number in React state. The first render returns `to`; subsequent `to` changes animate from the current value.

```tsx
const opacity = useTween({ to: isVisible ? 1 : 0, duration: 300 });
```

| Option          | Type                     | Default        | Description                                |
| --------------- | ------------------------ | -------------- | ------------------------------------------ |
| `to`            | `number`                 | Required       | Destination                                |
| `duration`      | `number`                 | `300`          | Positive finite duration in milliseconds   |
| `delay`         | `number`                 | `0`            | Delay before interpolation begins          |
| `easing`        | `(progress) => number`   | `easeOutCubic` | Easing function                            |
| `enabled`       | `boolean`                | `true`         | Jump to `to` when false                    |
| `reducedMotion` | `'complete' \| 'ignore'` | `'complete'`   | Jump to `to` or animate despite preference |

`useTween` updates React state on each animation frame. Use it for isolated values with inexpensive renders. It does not add visibility lifecycle behavior; use `useLoop` for imperative DOM or canvas work.

### Observation and input hooks

The observation hooks return a ref when one is not supplied. `useSight`, `useSize`, and `useScrollProgress` also support callback mode: supplying their callback omits the reactive value from the return type and avoids renders for observer deliveries. Their current value remains available through a ref.

| Hook                      | Purpose                               | Important options                                                                          | Return                                                |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `useSight`                | Element or page visibility            | `ref`, `target: 'page'`, `observe` (`'continuous'`), IO options, `onVisibilityChange`      | `ref`, reactive phase or `phaseRef`, `phaseReasonRef` |
| `useSize`                 | Content-box or border-box dimensions  | `ref`, `box` (`'content-box'`), `onResize`                                                 | `ref`, reactive size or `sizeRef`                     |
| `useContainerQuery`       | Match element width and height limits | Breakpoint object plus optional `ref`                                                      | `ref`, `matches`                                      |
| `useScrollProgress`       | Element intersection ratio            | `ref`, `steps` (`20`), `root`, `rootMargin`, `onProgress`                                  | `ref`, reactive progress or `progressRef`             |
| `useScroll`               | Scroll offset and progress            | `ref` or page target, `onScroll`, `visibility` (`'pause'`), `enabled` (`true`), IO options | `ref`, phase, `stateRef`, `measure`                   |
| `useMutation`             | Frame-coalesced mutation records      | `ref`, `mutation`, `onMutations`, `visibility` (`'pause'`), `enabled` (`true`), IO options | `ref`, phase and phase refs                           |
| `usePointer`              | Element-relative pointer coordinates  | `ref`, `onPointer`, `visibility` (`'pause'`), `enabled` (`true`), IO options               | `ref`, phase, `stateRef`                              |
| `useMediaQuery`           | Media-query match                     | Query string                                                                               | Boolean; initially `false` during SSR and hydration   |
| `usePrefersReducedMotion` | Reactive reduced-motion preference    | None                                                                                       | Boolean; initially `false` during SSR and hydration   |
| `useDevicePixelRatio`     | Reactive DPR                          | None                                                                                       | Number; initially `1` during SSR and hydration        |
| `useRenderState`          | `content-visibility` render state     | Element ref                                                                                | `rendered` or `skipped`                               |

`useScroll` and `usePointer` deliver high-frequency values through callbacks and refs, not React state. Their phase changes are reactive. Call `measure()` after changing scrollable content.

`useMutation` reads its `mutation` configuration when it subscribes. Toggle `enabled` to rebuild the observer after changing that configuration. Mutations that occur while visibility-paused are not replayed.

### Scheduling hooks

| Hook                                      | Behavior                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useThrottledCallback(callback, options)` | Stable function with `flush()` and `cancel()`; requires `interval`, with `edge: 'both'` and `hidden: 'flush'` by default |
| `useDebouncedCallback(callback, options)` | Stable function with `flush()` and `cancel()`; requires `wait`, with `hidden: 'flush'` by default                        |
| `useIdle(options)`                        | Returns `false`, then `true` after idle scheduling; accepts `timeout`                                                    |
| `useWhenIdle(callback, options)`          | Runs the current callback once after mount; accepts `timeout` and cancels on unmount                                     |

Changing throttle or debounce options discards pending work. Call `flush()` from application cleanup when the final pending value must be delivered.

The current `useIdle` and `useWhenIdle` bindings forward `timeout` but not the `signal` field from their shared `IdleOptions` type. Use core `whenIdle` when external abort control is required.

### Presence and transitions

`Presence`, `Swap`, `WhenVisible`, and `WhenIdle` use `data-phase` for state and `data-enter="animate"` to opt into a CSS `@starting-style` enter transition. Reduced motion suppresses the enter attribute; `Presence` and `Swap` complete exits immediately by default.

```tsx
const transition =
  'transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0';
```

#### Presence

Renders a `div` and coordinates enter and exit around its mounted state.

```tsx
<Presence show={isOpen} className={transition}>
  Modal content
</Presence>
```

| Prop            | Type                     | Default     | Description                             |
| --------------- | ------------------------ | ----------- | --------------------------------------- |
| `show`          | `boolean`                | Required    | Desired visibility                      |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or remain in the DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount enter behavior              |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout if no end event arrives  |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced-motion behavior                 |

In `mount` mode, content is removed after `transitionend`, `animationend`, or the safety timeout. In `reveal` mode, the element remains in the DOM and the application must style non-visible phases, such as `data-[phase=idle]:opacity-0`.

#### usePresence

Provides the same lifecycle without rendering a wrapper.

```tsx
import { usePresence } from '@usephase/react';

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

Returns `phase`, `phaseReason`, `mounted`, `ref`, and `enter`. Options match `Presence` behavior.

#### WhenVisible

Renders a sentinel and mounts children once it enters the configured intersection area. With the default `rootMargin`, mounting begins up to 200px before the viewport.

```tsx
<WhenVisible
  rootMargin="200px"
  className="transition-opacity data-[enter=animate]:starting:opacity-0"
>
  <HeavyInteractiveChart />
</WhenVisible>
```

Props are `rootMargin` (`'200px'` by default), `threshold`, `root`, `fallback`, and standard `div` props. Children stay mounted after the first intersection. The wrapper is present in server HTML, but the children are not; use a fallback or parent sizing when the final content occupies layout space.

#### Swap

Coordinates an exit before mounting the latest active state.

```tsx
<Swap active={success ? 'success' : 'form'}>
  <Swap.State
    id="form"
    className="transition-opacity data-[phase=exiting]:opacity-0"
  >
    <Form />
  </Swap.State>
  <Swap.State
    id="success"
    className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
  >
    <SuccessMessage />
  </Swap.State>
</Swap>
```

`Swap` accepts `active`, optional `exitDuration` (`5000` by default), and standard `div` props. Each `Swap.State` requires a unique `id`. Rapid active-state changes skip intermediate states and continue to the latest value. The initial state does not run an enter animation; later states can use `@starting-style`.

### Rendering and idle work

| Helper        | Defers                                    | In the DOM before activation? | In server HTML? |
| ------------- | ----------------------------------------- | ----------------------------- | --------------- |
| `Defer`       | Browser rendering for off-screen contents | Yes                           | Yes             |
| `WhenVisible` | Child mount until near the viewport       | No                            | No              |
| `WhenIdle`    | Child mount until idle scheduling         | No                            | No              |

#### Defer

Applies `content-visibility: auto` and an intrinsic-size estimate to one element. Children remain mounted and appear in server-rendered HTML.

```tsx
<Defer estimatedHeight="600px" className="my-section">
  <ArticleSection />
</Defer>;

// Choose a semantic wrapper with `as`.
<ul>
  {items.map((item) => (
    <Defer as="li" key={item.id} estimatedHeight="80px">
      <ItemContent item={item} />
    </Defer>
  ))}
</ul>;
```

| Prop              | Type                           | Default    | Description                                        |
| ----------------- | ------------------------------ | ---------- | -------------------------------------------------- |
| `as`              | `ElementType`                  | `'div'`    | Element to render                                  |
| `estimatedHeight` | `string`                       | `'1000px'` | Intrinsic-size fallback while contents are skipped |
| `ref`             | `Ref<HTMLElement>`             | None       | Ref for the rendered element                       |
| Other attributes  | HTML attributes except `style` | None       | Use `className` for additional styling             |

`Defer` does not defer mounting, hydration, timers, or effects. Paint containment clips overflow at the element's padding edge. Keep shadows, negative margins, and positioned content that must escape the boundary outside `Defer`. Use `useRenderState` to pause application-managed work inside a skipped subtree.

#### WhenIdle

Mounts children once idle scheduling runs after mount. It is one-shot.

```tsx
<WhenIdle
  fallback={<Skeleton />}
  className="transition-opacity data-[enter=animate]:starting:opacity-0"
>
  <SecondaryPanel />
</WhenIdle>
```

Props are `timeout`, `fallback`, and standard `div` props. Children are absent from server HTML, so reserve it for non-critical UI. Use `Defer` when content must remain mounted or present in server HTML.

### Utility hooks

| Hook                          | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `useSyncedRef(value)`         | Returns a ref updated to the latest value during render    |
| `useStableCallback(callback)` | Returns a stable function that invokes the latest callback |

## Errors

`PhaseError` includes a machine-readable `code`, plus optional `reason`, `fix`, and `link` fields. Use `isPhaseError` to narrow unknown errors.

```ts
import { PhaseError, isPhaseError } from '@usephase/core';
```

| Code                 | Trigger                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `server_context`     | Calling a browser-only primitive without its required browser global |
| `no_target`          | Passing a null or undefined core target                              |
| `conflicting_target` | Passing both `ref` and `target` to a hook                            |
| `invalid_duration`   | Passing a non-positive or non-finite `useTween` duration             |
| `invalid_fps`        | Passing a non-positive or non-finite FPS value                       |
| `ticker_stopped`     | Starting, resuming, or changing FPS on a stopped ticker              |
| `missing_context`    | Rendering `Swap.State` outside `Swap`                                |

## Compatibility and SSR

- `@usephase/react` declares React 18 or newer as a peer dependency.
- The package manifests require Node.js 24.x for package tooling.
- Browser primitives use `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver`, and `matchMedia` where their contracts require them. Phase does not include legacy-browser polyfills.
- Browser-sensitive tests run in the Chromium, Firefox, and WebKit versions pinned by Playwright. The project does not currently publish a minimum browser-version matrix.
- `whenIdle` falls back to a near-immediate task when `requestIdleCallback` is unavailable.
- `createRenderState` remains `rendered` when the browser does not emit `contentvisibilityautostatechange`.
- `Defer` follows the browser's `content-visibility` behavior and support.
- Calling a browser-only core primitive during SSR throws `server_context`. `prefersReducedMotion()` returns `false` without `matchMedia`, and `@usephase/core/ease` is browser-independent.
- Observer and media-query hooks establish subscriptions in effects. Media-query hooks return their documented initial value during server rendering and hydration.

## Bundle size

CI measures every export with [Size Limit](https://github.com/ai/size-limit). Values are minified and brotli-compressed. Core rows include code pulled in by that export. React rows measure the binding and exclude React and `@usephase/core`.

<details>
<summary>Current per-export sizes</summary>

<!-- SIZE-TABLE:START -->

| Export                    | Size (min+brotli) |
| ------------------------- | ----------------: |
| **Core**                  |                   |
| `createTicker`            |           1.24 kB |
| `createSight`             |           1.08 kB |
| `createLifecycle`         |           1.59 kB |
| `createLoop`              |           3.12 kB |
| `createScrollProgress`    |             934 B |
| `createRenderState`       |             490 B |
| `createDevicePixelRatio`  |             544 B |
| `createMutation`          |           1.54 kB |
| `createPointer`           |           1.64 kB |
| `createScroll`            |           2.07 kB |
| `createThrottle`          |             983 B |
| `createDebounce`          |             558 B |
| `whenIdle`                |             409 B |
| `prefersReducedMotion`    |             101 B |
| `PhaseError`              |              98 B |
| `isPhaseError`            |             103 B |
| **Ease**                  |                   |
| `ease (all)`              |             210 B |
| **React**                 |                   |
| `useLoop`                 |             421 B |
| `useLifecycle`            |             366 B |
| `useSight`                |             377 B |
| `useCanvas`               |             788 B |
| `useMutation`             |             301 B |
| `usePointer`              |             337 B |
| `useScroll`               |             440 B |
| `useThrottledCallback`    |             205 B |
| `useDebouncedCallback`    |             202 B |
| `useTween`                |             452 B |
| `usePresence`             |             534 B |
| `useScrollProgress`       |             216 B |
| `useSize`                 |             365 B |
| `useContainerQuery`       |             239 B |
| `useMediaQuery`           |              61 B |
| `usePrefersReducedMotion` |              92 B |
| `useDevicePixelRatio`     |              58 B |
| `useSyncedRef`            |              22 B |
| `useStableCallback`       |              39 B |
| `Presence`                |             698 B |
| `WhenVisible`             |             578 B |
| `WhenIdle`                |             197 B |
| `Defer`                   |              85 B |
| `useIdle`                 |              66 B |
| `useWhenIdle`             |             121 B |
| `useRenderState`          |              92 B |
| `Swap`                    |             951 B |

<!-- SIZE-TABLE:END -->

</details>
