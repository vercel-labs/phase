# phase

## 0.5.2

### Patch Changes

- IntersectionObserver pooling now isolates observers with distinct custom roots.
- `usePointer().stateRef.current.active` now updates on pointer entry and visibility suspension, before another pointer callback runs.
- Raised IO-dependent export size budgets to restore regression headroom.

## 0.5.1

### Patch Changes

- Pointer, scroll, mutation, and throttle state now flushes before frame-loop callbacks in the same animation frame.
- Input callback errors no longer suppress other input or frame-loop callbacks; the first input error is rethrown after the frame unless a ticker callback throws first.
- Raised the affected core and React wrapper size budgets for the shared input stage.

## 0.5.0

### Minor Changes

- `frame.elapsed` now advances by exactly the `frame.delta` delivered to each callback, including after delayed frames.
- A delayed callback now advances `frame.delta` by at most 40ms without an FPS limit, or one configured FPS interval plus 40ms with a limit. The first callback after `start()` or `resume()` uses 16.67ms without a limit, or one configured interval with a limit.

## 0.4.2

### Patch Changes

- `createTicker` now shares one frame clock across duplicate phase copies in the same JavaScript global that use the same clock protocol.
- Raised the `createTicker`, `createLoop`, `useLoop`, and `useCanvas` size budgets to cover the shared registry and restore headroom.

## 0.4.1

### Patch Changes

- `createLoop` no longer destroys and rebuilds its internal ticker when FPS throttling changes (e.g. tab blur/refocus). Frame count, elapsed time, and the `frame` object now survive those changes instead of restarting.
- An FPS cap change while the loop is paused now takes effect on resume.
- `createLoop` validates `fps` and `degradedFps` at construction; invalid values throw `invalid_fps`.
- `stop()` on a running loop no longer recreates and leaks its internal ticker during teardown, and an `onPhaseChange` callback that throws on stop can no longer leave the loop half-disposed.

## 0.4.0

### Minor Changes

- `Ticker.setFps(fps?)` changes the FPS cap without restarting the ticker: the frame count, elapsed time, and pause accounting all continue. `undefined` removes the cap. A stopped ticker throws `ticker_stopped`.
- An `fps` that is not a finite number greater than 0 now throws the new `invalid_fps` error, from both `createTicker` and `setFps`. A failed `setFps` keeps the previous cap. `fps: 0` previously meant uncapped; it now throws.
- FPS caps now hold their target rate. A 60fps cap on a 60Hz display previously delivered ~30fps because rounded browser timestamps kept missing the eligibility window.
- Raised the `createTicker`, `createLoop`, `useLoop`, and `useCanvas` size budgets to cover the new API and restore the documented headroom.

## 0.3.3

### Patch Changes

- Split the audit scanner into typed TypeScript region modules without changing its detection behavior.

## 0.3.2

### Patch Changes

- Give `useTween` a dedicated reduced-motion type and remove the unsupported `'pause'` mode.

## 0.3.1

### Patch Changes

- Pooled IntersectionObserver and ResizeObserver support multiple subscribers per element. A second subscriber on the same element previously replaced the first, so one of two hooks watching the same node stopped receiving updates, and the element was unobserved as soon as either cleaned up. Both pools now track a set of subscribers and release the element only once the last one is gone, matching the MediaQueryList pool.
- Raised the `useSize`, `useSight`, `createPointer`, and `useContainerQuery` size budgets to cover the pooling fix and restore the documented headroom.

## 0.3.0

### Minor Changes

- `createSight`, `createLifecycle`, and `createLoop` accept `document` as the `target`, anchoring to the page instead of an element. No `IntersectionObserver` is created and visibility follows the tab.
- `useSight`, `useLifecycle`, and `useLoop` accept `target: 'page'`, mutually exclusive with `ref`. The hooks take a string rather than `document` because their options are built during render, which runs on the server for a client component.
- `createSight` reports its initial phase in page mode, so `useSight({ target: 'page', observe: 'once' })` no longer throws during construction.
- `createSight` and `createScroll` release the listeners they attached if a consumer callback throws during construction, which page mode reaches because it emits before the caller holds an instance to stop.
- `createScroll` coalesces resize-driven geometry reads into its frame flush, so a burst of resize signals costs one layout read instead of one each. `measure()` is still synchronous.

## 0.2.0

### Minor Changes

- `createScroll` and `useScroll` can track the page. Pass `target: document` to `createScroll`, or `target: 'page'` to `useScroll`, to read page scroll offset and progress. The hook takes a string because its options are built during render, which runs on the server for a client component.
- Added the `conflicting_target` error code, thrown when a hook receives both `ref` and `target`.

## 0.1.0

### Minor Changes

- **Breaking:** renamed the `element` option to `target` on `createScroll`, `createSight`, `createLifecycle`, `createLoop`, `createPointer`, `createMutation`, `createScrollProgress`, and `createRenderState`. React hooks are unaffected; they still take `ref`.
- **Breaking:** the `PhaseError` code for a missing target is now `no_target` (was `no_element`).
- **Breaking:** renamed `useTween`'s `target` option to `to`, so `target` means the observed anchor everywhere in the API.
- Raised the `useTween` size budget from 675 B to 720 B, restoring the standard ~10% headroom.

## 0.0.12

### Patch Changes

- Harden shared ticker scheduling under reentrant lifecycle changes and callback errors.

## 0.0.11

### Patch Changes

- Apply updated `useTween` easing functions without restarting active tweens.

## 0.0.10

### Patch Changes

- Make completed `useTween` animations land exactly on their target with custom easing.

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
