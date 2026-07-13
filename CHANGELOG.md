# phase

## 0.0.4

### Patch Changes

- Add `createMutation` (core) and `useMutation` (React hook): lifecycle-aware MutationObserver with rAF-coalesced callbacks. Auto-pauses off-screen via pooled IO. Dev-mode warning for reflow-storm-shaped observer configurations (`subtree` + `attributeFilter: ['style'|'class']`).
- Core `createMutation` exposes `onPhaseChange` callback for phase-transition observation, matching `createSight` and `createLifecycle`.
- React `useMutation` follows the `useSight` dual-mode pattern: reactive by default (phase transitions trigger re-renders via `useState`), transient when `onPhaseChange` is provided (zero re-renders, `phaseRef`/`phaseReasonRef` always current).
- Add `createMockMutationObserver` shared test mock, matching the IO/RO/MQL mock pattern.
- AGENTS.md: add admission criteria and export taxonomy. Expand rule 8 (phases + reasons) to require `onPhaseChange` on core primitives and `useState` + transient mode on React hooks. Add `lib.dom` type-name collision check and `pnpm size:readme` to new-export checklists.

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
