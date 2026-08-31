# Performance rules

Impact-ranked do's and don'ts for writing performant animation code with phase. These are not aspirations. They are tested invariants backed by `src/__tests__/perf.spec.ts`.

## Contents

- **Critical.** Zero per-frame allocations | Never write repeated state in onTick | No forced reflows | No layout-inducing writes
- **High.** Strong pause | Reduced motion by default | Stable function references
- **Medium.** Frame-locked shared clock | Frame time after delays | Observer pooling | Never drive layout from a MutationObserver | will-change lifecycle | No getBoundingClientRect for visibility
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

### Never write repeated state inside `onTick` / `draw`

A state update in a recurring callback can make React re-render on every tick and compete with the animation. Check whether it repeats or records one final state change. Write repeated values to refs or the DOM.

**Do:**

```ts
onTick: (frame) => {
  ref.current.style.opacity = String(clamp01(frame.elapsed / 1000));
};
```

**Don't:**

```ts
onTick: (frame) => {
  setOpacity(clamp01(frame.elapsed / 1000)); // may re-render on every tick
};
```

A one-time state update is allowed if the callback first sets a guard and then disables the phase loop or stops scheduling raw rAF. The guard prevents another update before React commits and tears down the hook. Use this only to record completion or recovery, not values that change every frame. See [Finite sequence](./timed-sequences.md#finite-sequence-stop-after-the-last-step). Use `useTween` when one value intentionally drives React rendering.

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

### No layout-inducing writes in animation paths

Avoiding layout reads is only half the contract. Repeated writes to geometry or SVG transform attributes invalidate layout or paint, so the browser must redo that work while the animation runs. This remains true when WAAPI or CSS owns other parts of the timeline.

**Do:** Animate `transform` or `opacity` on an HTML wrapper. A CSS transform directly on an SVG element can also work when its browser support and `transform-box` behavior are verified.

```ts
wrapper.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
```

**Don't:** Mutate SVG transform lists or geometry every frame.

```ts
onTick: () => {
  svgTransform.setTranslate(x, y);
  path.setAttribute('d', nextPath);
};
```

The same rule applies to repeated CSS layout writes such as `width`, `height`, inset positions, margins, and padding. A one-time write for sizing or layout is legitimate; the costly pattern is writing these properties repeatedly in an animation, pointer-move, or observer path.

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

### `display:none` is a first-class pause signal

An element (or ancestor) set to `display:none` has no layout box, so `IntersectionObserver` reports it as `isIntersecting: false` (ratio `0`). Every phase primitive built on `createSight` — `createLoop` / `useLoop`, `createLifecycle` / `useLifecycle`, `useCanvas`, and the `visibility: 'pause'` mode of `createMutation` / `createPointer` — treats that as "not visible" and strong-pauses (`cancelAnimationFrame`, zero CPU), alongside off-screen and backgrounded-tab. The ratio-0 report is plain browser behavior; phase's contract is composing it into a strong pause uniformly across every lifecycle primitive (a raw `IntersectionObserver` only gives you the signal).

**Don't** re-check it by hand — it's already handled, and reading layout to do so forces a reflow:

```ts
if (getComputedStyle(el).display === 'none') loop.pause(); // redundant + forced reflow
```

**Scope: only `display:none`.** `visibility: hidden` and `opacity: 0` keep the layout box, so IO still reports them as intersecting and phase keeps running. Pause those yourself (`enabled`, `stop()`, `pause()`).

### Reduced motion by default

All phase primitives respect `prefers-reduced-motion: reduce` automatically. Bypassing requires explicit `reducedMotion: 'ignore'`.

**Don't:**

```ts
// Ignoring reduced motion without justification
createLoop({ target: el, onTick: draw, reducedMotion: 'ignore' });
```

**Do:** Use `'ignore'` when motion is essential, such as in a data visualization, game, or motion-based accessibility feature. It is also valid when a parent responds to preference changes, does not render the animated child while reduced motion is on, and shows the same information without motion. A one-time check or incomplete fallback does not qualify.

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

All tickers share one `requestAnimationFrame` loop and receive the same browser-supplied timestamp each frame.

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

### Frame time after delays

`frame.elapsed` increases by exactly the `frame.delta` delivered to each callback. After a delayed callback, `delta` is at most 40ms without an FPS limit, or one configured interval plus 40ms with a limit. The first callback after `start()` or `resume()` uses 16.67ms without a limit, or one configured interval with a limit.

Repeated delays can make an animation advance more slowly than real time instead of jumping by the full delay. Pausing stops elapsed time from advancing. `frame.time` remains the browser's unmodified `requestAnimationFrame` timestamp so non-phase code can use the same source time.

**Don't:**

```ts
onTick: (frame) => {
  // Using raw time difference instead of frame.delta
  const dt = performance.now() - lastTime; // can be 10000ms after tab switch
  position += velocity * dt; // large jump
};
```

**Do:** Use `frame.delta` and `frame.elapsed` for animation progress. Elapsed time advances by the delivered delta and does not advance while paused.

### Observer pooling

phase pools IntersectionObserver (keyed by serialized options), ResizeObserver (singleton), and MediaQueryList (keyed by query string).

A raw IO/RO finding means only that the code skips the shared pool; it does not prove a leak. Before replacing it, check how many elements it watches, how it uses each observer entry, how elements are removed, and who disconnects it. Replace it only if a phase API supports the same behavior.

**Example to review:**

```ts
// Creating raw observers outside the pool
const io = new IntersectionObserver(callback, options);
io.observe(element);
```

Use `createSight`, `createScrollProgress`, `useSize`, or `useMediaQuery` when they provide the same elements and observer data; all use shared pools. Twenty elements with the same IO options share one observer. A raw observer may be simpler for changing element sets or data from each entry. Keep it only if removed elements are unobserved and cleanup disconnects it.

Fix or replace observers with missing cleanup, one observer per item, duplicate subscriptions, or simple single-element wiring that a phase API already covers.

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
