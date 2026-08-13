# phase

## 0.0.10

### Patch Changes

- **Added:** Added `Ticker.setFps` for validated in-place FPS cap changes with a continuous timeline.
- **Changed:** Hardened the shared ticker against reentrant subscription changes, callback failures, cadence drift, and mutable frame counters.
- **Changed:** `createLoop` keeps one persistent ticker and uses one display-cadence-aware shared frame-pressure monitor.
- **Changed (breaking):** Replaced `degraded` and `degradedFps` with `unfocused`, `slowFrames`, and `throttleFps`.
- **Changed (breaking):** Loop reduced motion now accepts `'pause' | 'ignore'` through `LoopReducedMotion`.
- **Changed (breaking):** Tween reduced motion now accepts `'complete' | 'ignore'` through `TweenReducedMotion`.
- **Removed (breaking):** Removed `ReducedMotionBehavior`.
- **Changed (breaking):** Replaced singular quality reason/behavior fields with an immutable `LoopQuality` snapshot containing all active signals and the resolved `QualityAction`.
- **Changed:** `useLoop` and `useCanvas` expose reactive quality by default and transient `qualityRef` mode with `onQualityChange`.
- **Changed:** `useCanvas` separates adaptive pixel ratio from focus throttling, defers hidden buffers, and repaints visible paused buffers safely.
- **Changed:** `useTween` completes when reduced motion changes and always lands exactly on its target.
- **Fixed:** Observer pools support multiple same-element subscribers, distinct custom roots, and independent ResizeObserver box options.
- **Fixed:** Terminal and construction callbacks cannot leave live tickers, observers, or listeners behind.
- **Fixed:** Invalid FPS values throw `invalid_fps`; only `undefined` means uncapped.
- **Fixed:** One throwing `onTick` no longer starves the other loops on the shared clock. The error still reaches the page.
- **Fixed:** Frame-pressure recovery is armed even when a consumer quality callback throws, and probation always terminates instead of parking at `'probing'` when page occupancy sits between the healthy and overload thresholds.
- **Fixed:** `useCanvas` no longer sizes a buffer or draws while unmounting off screen, tracks quality mode when `onQualityChange` is added or dropped without a remount, and restamps the `size` and repaint `FrameState` it hands out so consumer writes cannot corrupt a later repaint.

## 0.0.9

### Patch Changes

- Replace shipped string concatenation with template literals.

## 0.0.8

### Patch Changes

- Add `createThrottle` and `useThrottledCallback`: frame-aligned, visibility-aware throttle for event-driven work below frame rate (socket emits, worker messaging). Leading calls fire synchronously; trailing calls fire frame-aligned with the latest value; pending work is flushed or dropped when the document hides.
- Add `createDebounce` and `useDebouncedCallback`: visibility-aware trailing debounce (fire after quiet) for burst-settled work such as canvas buffer reallocation after resize.
- Skill: document the poll-vs-event rate-limiting decision in `use-pointer`, `use-scroll`, and rewrite the `use-mutation` buffered-drain recipe on `useThrottledCallback`.

## 0.0.7

### Patch Changes

- Add `createScroll` and `useScroll`: a lifecycle-aware scroll tracker for custom scrollbars, carousels, and scroll-position indicators.

## 0.0.6

### Patch Changes

- Add `createPointer` and `usePointer`: lifecycle-aware pointer tracker that reads `getBoundingClientRect` once per rAF frame instead of per `pointermove`, auto-pauses off-screen, and exposes an always-current `stateRef` for reading `{ x, y, active }` on demand.
- **Breaking (alpha):** `useMutation` and `usePointer` drop `onPhaseChange` and the reactive/transient overloads; `phase`/`phaseReason` are now always reactive state (with `phaseRef`/`phaseReasonRef`), matching `useLoop`/`useCanvas`. Use the core `createMutation`/`createPointer` for synchronous phase callbacks.
- Skill: document `display:none` as an automatic pause signal (`visibility: hidden` / `opacity: 0` keep their box and do not pause).

## 0.0.5

### Patch Changes

- Add polymorphic `as` prop to `Defer` (default `'div'`). Renders semantic elements (`li`, `tr`, `section`) without a wrapper div.
- Skill: document overflow clipping, Safari caveats, and when-to-skip guidance for `Defer`.

## 0.0.4

### Patch Changes

- Add `createMutation` and `useMutation`: lifecycle-aware MutationObserver with rAF-coalesced callbacks, off-screen pausing, and reactive/transient dual mode.
- Add admission criteria and export taxonomy to AGENTS.md.

## 0.0.3

### Patch Changes

- Add `box` option to `useSize`: `'content-box' | 'border-box'`. Defaults to `'content-box'`. With `'border-box'`, the hook returns the element's full visual bounds (content + padding + border) and the ResizeObserver fires on border-box changes.
- The RO pool's `observeResize` now accepts an optional `box` parameter forwarded to `ResizeObserver.observe()`, enabling per-element box model observation on the singleton.
- Skill: added 3D canvas overlay recipe to `use-size.md` and `use-canvas.md`.
- Skill: documented the distinction between dimension tracking (`useSize`, reflow-free) and viewport-relative position tracking (`getBoundingClientRect()`, custom hook).

## 0.0.2

### Patch Changes

- Add transient (zero-re-render) mode to `useSize`, `useScrollProgress`, and `useSight`. Pass a callback (`onResize`, `onProgress`, `onVisibilityChange`) to receive updates imperatively. The reactive state field is omitted from the return type via overloads, so accessing it in transient mode is a compile-time error.
- Add always-current refs (`sizeRef`, `progressRef`, `phaseRef`, `phaseReasonRef`) to all three hooks. Available in both reactive and transient modes.
- Export new types: `SizeCallback`, `ScrollProgressCallback`, `SightCallback`, and reactive/transient result interfaces for each hook.

## 0.0.1

### Patch Changes

- Initial alpha release
