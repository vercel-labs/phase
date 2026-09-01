# phase library instructions

This package is the published `phase` library. Run commands from the repository root unless a command explicitly uses `--filter phase`.

## Architecture

The library has two layers: framework-agnostic core primitives and React bindings.

| Folder           | Purpose                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `src/ease/`      | Pure math. No browser APIs or React.                                                            |
| `src/core/`      | Framework-agnostic primitives and browser APIs. `_internal/` is package-private infrastructure. |
| `src/react/`     | React hooks and components built on core. `_internal/` is package-private React infrastructure. |
| `src/__tests__/` | Cross-cutting library suites such as performance budgets.                                       |
| `src/__mocks__/` | Shared browser API mocks for deterministic unit tests.                                          |

### File organization

- Give each module a kebab-case folder containing `index.ts` and a co-located `index.spec.ts` or `index.spec.tsx`.
- Put native observer and scheduling coverage in `index.browser.spec.ts` or `index.browser.spec.tsx`.
- Keep the only barrels at `src/index.ts`, `src/ease/index.ts`, and `src/react/index.ts`.
- Keep `_internal/` helpers within their layer. Never export them or import them across layers.
- Match the structure of a sibling module when adding a module.

### Entry points

| Export    | Source               | Contents                            |
| --------- | -------------------- | ----------------------------------- |
| `.`       | `src/index.ts`       | Core primitives, easing, and errors |
| `./ease`  | `src/ease/index.ts`  | Easing and math utilities           |
| `./react` | `src/react/index.ts` | React hooks and components          |

## Performance contracts

Every module must satisfy these contracts.

### Hot paths

- Allocate nothing per frame. Avoid object, array, string, closure, spread, `.map()`, and `.filter()` creation in `onTick` paths.
- Mutate the sealed `FrameState` shape in place.
- Do not wrap `onTick` in `try/catch`. Input-stage dispatch isolates consumer exceptions and rethrows after both stages complete; a tick exception retains precedence and aborts the remaining ticks.
- Create frame callbacks once and keep their references stable.
- Do not log or create debug strings unless devtools are active.

### Lifecycle

- Strong pause cancels scheduling entirely with `cancelAnimationFrame()`.
- Tickers within one JavaScript global, such as a page or worker, share one browser `requestAnimationFrame` loop and timestamp. This includes separately bundled copies of phase.
- Keep elapsed time and delivered frame count in private numbers, then publish them through the reused `FrameState` object. Callback changes to that object must not alter later frames.
- After a delayed callback, limit `frame.delta` to 40ms without an FPS limit or one configured interval plus 40ms with a limit.
- The first callback after `start()` or `resume()` uses 16.67ms without a limit or one configured interval with a limit.

### Browser APIs

- Never force layout from frame-loop callbacks. Controlled synchronous exceptions are `createPointer` reading one input-stage rect per dirty frame and `createScroll` reading scroll geometry on attachment, explicit `measure()`, or an input-stage resize flush. Do not add other synchronous layout reads.
- Read element dimensions through ResizeObserver. `createScroll` uses observer and page-resize signals to refresh its scroll-geometry cache.
- Read visibility through IntersectionObserver.

### React

- Frame loops must not trigger React renders. Write per-frame state to refs or the DOM.
- Only phase transitions may call `setState`.
- Store `onTick` and `onDraw` in `useSyncedRef`. Use `useStableCallback` when a consumer callback needs stable identity outside the loop.

### Performance tests

`src/__tests__/perf.spec.ts` gates these contracts:

1. The same `FrameState` object is reused across 10,000 frames.
2. Per-frame math overhead stays below 0.1 ms.

## Bundle size

Every public export is measured separately through the source barrels listed in `.size-limit.json`. Ease is measured as one entry point. CI enforces every budget.

- Run `pnpm size` before and after public API or dependency changes.
- Avoid imports that pull unrelated code into an export's tree.
- Add a `.size-limit.json` entry for each new export. Set the limit about 20% above measured size below 500 B and about 10% above larger exports.
- Keep shipped error strings concise.

## Code style

| Convention        | Rule                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| Files and folders | `kebab-case`                                                            |
| Types             | `PascalCase`                                                            |
| Functions         | `camelCase`                                                             |
| `any`             | Banned. Use `unknown` and narrow.                                       |
| Import extensions | Omit `.js` extensions.                                                  |
| Index imports     | Infer directory indexes; do not write `/index`.                         |
| Type imports      | Use `import type` and `export type`.                                    |
| Barrels           | Export APIs before types and contain pure re-exports only.              |
| Public JSDoc      | Explain observable behavior and rationale, not implementation.          |
| Inline comments   | Add only where the code cannot explain itself.                          |
| Boolean props     | Only `enabled` may be boolean. Model other behavior with string unions. |
| Exported types    | Do not shadow `lib.dom` globals.                                        |

Tests use named Vitest projects. `unit` runs jsdom specs and is the default for `pnpm test`; `browser` runs `*.browser.spec.*` in headless Chromium, Firefox, and WebKit through Playwright. Run it with `pnpm test:browser` after installing the three Playwright browsers. Browser specs must exercise native observer and scheduling APIs, must not import `src/__mocks__/`, and should wait on observable state instead of fixed timing. Keep headless-unreachable fault injection in a residual `index.spec.*`; each behavior belongs to one project only.

The package ships zero runtime dependencies. Never add one without explicit approval, and pin every dependency exactly.

## Design rules

1. Keep the three designated barrels as pure re-exports with no declarations, logic, or side effects.
2. Never export `_internal/` code.
3. Preserve zero per-frame allocations.
4. Keep React optional; core must work without React.
5. Preserve dependency direction: ease has no dependencies, core depends on ease and core internals, React depends on core.
6. Co-locate every module test.
7. Use the observer pools. IO is keyed by serialized options, RO is a singleton, and MQL is keyed by query string.
8. Every state machine exposes phase and reason. Core primitives with phases expose `onPhaseChange`. React hooks use state for reactive phase/reason, refs for current values, and a callback escape hatch for transient mode.

## Admission criteria

Every proposed export must satisfy all four criteria. Otherwise, implement the capability as a skill recipe or scanner signal.

1. It wraps a browser API that is easy to misuse and whose misuse has measurable cost.
2. It manages browser, render, or CSS containment lifecycle.
3. It makes the safe path shorter than using the raw API.
4. It stays individually lean under a measured size budget.

Infrastructure exports such as errors and easing math support admitted primitives and do not need to satisfy the first two criteria independently.

CSS linting, stylesheet build analysis, bundler configuration, design-system components, modal layers, and general DOM scheduling beyond rAF batching do not belong in this package.

## Export taxonomy

| Category    | What it wraps                                                             |
| ----------- | ------------------------------------------------------------------------- |
| Timing      | rAF, shared frame clocks, and rate limiting                               |
| Observation | IO, RO, MQL, MO, pointer, scroll, and render-state browser APIs           |
| Lifecycle   | Visibility, reduced-motion, and idle activation signals                   |
| Composition | Mount and unmount orchestration                                           |
| Math        | Pure easing and interpolation functions                                   |
| Utility     | React ref and callback patterns required by phase internals and consumers |

## Adding features

### Core primitive

1. Add `src/core/<name>/index.ts` and `index.spec.ts`.
2. Export the API and types from `src/index.ts`.
3. Add and measure a `.size-limit.json` entry.
4. Add `../../skills/phase/references/<name>.md` from the reference template.
5. Add `onPhaseChange` when the primitive has phases.
6. Check exported type names against `lib.dom`.
7. Run `pnpm format:fix && pnpm size:readme && pnpm validate`.

### React hook or component

1. Add `src/react/<name>/index.ts(x)` and `index.spec.ts(x)`.
2. Export the API and types from `src/react/index.ts`.
3. Add and measure a `.size-limit.json` entry with `"ignore": ["react"]`.
4. Add `../../skills/phase/references/<name>.md` from the reference template.
5. Use reactive phase state, current-value refs, and transient callback mode when exposing phase state.
6. Use string unions instead of boolean behavior props other than `enabled`.
7. Check exported type names against `lib.dom`.
8. Run `pnpm format:fix && pnpm size:readme && pnpm validate`.

### Easing function

1. Add a pure number-to-number function to `src/ease/index.ts`.
2. Add cases to `src/ease/index.spec.ts` and re-export it from `src/index.ts`.
3. Run `pnpm size` and adjust the ease budget only when measured output requires it.
4. Update `../../skills/phase/references/ease.md`.
5. Run `pnpm format:fix && pnpm validate`.

## Skill synchronization

Public API changes are incomplete until the installable skill is updated.

- Update the matching reference after option, type, default, phase, or reason changes.
- Update every occurrence of the canonical CSS pattern together.
- Keep the choosing-a-primitive tables in the library README and `../../skills/phase/SKILL.md` synchronized.
- Add or remove references with public exports. `pnpm skill:check` rejects uncovered exports and orphan references.
- Exclude bundle sizes, implementation details, and version-specific workarounds from skill references.

Follow [`../../docs/adr/README.md`](../../docs/adr/README.md) for architecture decisions and the root [`../../AGENTS.md`](../../AGENTS.md) for repository validation and versioning.
