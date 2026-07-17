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

### `display:none` is a first-class pause signal

phase treats an element removed from layout as "not visible," identical to scrolled off-screen or in a backgrounded tab. Set an element (or any ancestor) to `display:none` and every phase primitive built on `createSight` — `createLoop` / `useLoop`, `createLifecycle` / `useLifecycle`, `useCanvas`, and the `visibility: 'pause'` mode of `createMutation` / `createPointer` — pauses automatically to zero CPU. No manual visibility check, no separate code path.

**What's phase and what's the browser.** The underlying report is standard `IntersectionObserver` behavior: an element with no layout box (what `display:none` produces) is reported as `isIntersecting: false`, ratio `0`. That fact is not unique to phase. What phase guarantees is composing that signal into a _strong pause_ (`cancelAnimationFrame`, not a weak early-return) consistently across every lifecycle primitive, and keeping it in sync with the off-screen and document-hidden signals. A raw `IntersectionObserver` gives you the signal; phase turns it into the pause, tested and uniform, so you never wire `IntersectionObserver` + `cancelAnimationFrame` by hand.

**Scope: only `display:none`.** `visibility: hidden` and `opacity: 0` keep the element's layout box, so IO still reports it as intersecting and phase keeps running — they mean "painted but invisible," not "not rendered." To pause those, toggle `enabled` (hooks) or call `stop()` / `pause()` yourself.

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
