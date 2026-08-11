# phase

## 0.0.10

### Patch Changes

- Fix `createLoop` resetting `frame.elapsed`, `frame.delta`, `frame.frame`, and the `FrameState` object identity when adaptive quality rebuilds the internal ticker (window blur/focus, frame-budget throttling). The loop now owns the consumer-facing frame timeline; the ticker is only a scheduler.
- **Breaking:** replace `degraded`/`degradedFps` on `createLoop`/`useLoop`/`useCanvas` with per-signal options: `unfocused` (default `'pause'`, so blur freezes the timeline and refocus resumes in place), `frameBudget` (default `'throttle'`), and `throttleFps` (default `30`). `pause` wins over `throttle` wins over `ignore` when both signals are active.
- **Breaking:** loops accept `reducedMotion: 'pause' | 'ignore'` (`LoopReducedMotion`); the documented-but-unimplemented `'complete'` is removed. `useTween` owns `TweenReducedMotion` (`'complete' | 'ignore'`); its never-implemented `'pause'` is removed. `ReducedMotionBehavior` is no longer exported.
- Under `reducedMotion: 'pause'`, loops paint exactly one static frame once the element is first visible, so canvas surfaces are never blank.
- `createLifecycle` exposes the raw sight signal: a `visible` getter and an `onVisibleChange` callback.
- `useCanvas` keeps the full-resolution buffer while the loop is paused-degraded; the 1x-DPR downscale applies only while degraded output is actually rendering.

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
