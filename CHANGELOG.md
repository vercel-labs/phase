# phase

## 0.0.6

### Patch Changes

- Add `createPointer` and `usePointer`: lifecycle-aware pointer tracker that reads `getBoundingClientRect` once per rAF frame instead of per `pointermove` event, and auto-pauses off-screen via the shared IntersectionObserver pool. `usePointer` delivers position imperatively via `onPointer`, exposes reactive `phase`/`phaseReason` (plus `phaseRef`/`phaseReasonRef`), and mirrors the latest `{ x, y, active }` in an always-current `stateRef` for on-demand reads (e.g. inside a `useLoop` tick).
- Align `useMutation` and `usePointer` with the per-frame producer shape used by `useLoop`/`useCanvas`. The hooks no longer accept `onPhaseChange` or return the reactive/transient overload pair. Phase transitions are infrequent, so `phase`/`phaseReason` are now always reactive state (with `phaseRef`/`phaseReasonRef` for imperative reads). For a synchronous phase reaction, use the core `createMutation`/`createPointer`, which still expose `onPhaseChange`. Removed type exports: `MutationPhaseCallback`, `PointerPhaseCallback`, `UseMutation{Reactive,Transient}Result`, `UsePointer{Reactive,Transient}Result`.
- Document the `display:none` pause behavior in `performance.md` as a contract: elements removed from layout report intersection ratio 0, so every phase primitive built on `createSight` pauses automatically (`visibility: hidden` / `opacity: 0` keep their box and do not pause).

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
