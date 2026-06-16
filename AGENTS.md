# phase — Agent Instructions

> **Status: Alpha** — APIs are evolving rapidly. Breaking changes happen without notice.

## Repository Overview

Animation infrastructure for the web. Lifecycle-aware primitives that compose visibility, timing, reduced motion, and quality signals into coherent state machines with debuggable transitions.

Tech stack: TypeScript 6+, tsdown (bundler), vitest (tests), oxlint (linting), oxfmt (formatting), lefthook (pre-commit hooks).

## Commands

```bash
pnpm build             # Build (tsdown)
pnpm test              # Run tests (vitest)
pnpm typecheck         # Type check (tsc --noEmit)
pnpm lint              # Lint (oxlint)
pnpm lint:fix          # Lint and auto-fix (oxlint --fix)
pnpm format            # Check formatting (oxfmt --check)
pnpm format:fix        # Fix formatting (oxfmt)
pnpm validate          # Run typecheck, lint, format, and test in parallel
```

## Architecture

Two-layer design: core primitives (framework-agnostic) and React bindings.

### Top-level folders

| Folder   | Purpose                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ease/`  | Pure math — easing functions, clamping, interpolation. No browser APIs, no React. Safe anywhere.                                                                                       |
| `core/`  | Framework-agnostic primitives — ticker, sight, loop. Browser APIs live here. `_internal/` holds shared infrastructure (error factory, observer pools) that is never exported publicly. |
| `react/` | React hooks and components. Each hook or component gets its own folder. Depends on `core/` for the underlying primitives. `_internal/` holds shared hooks not exported publicly.       |
| `tests/` | Shared test infrastructure — mock factories for IO/RO/MQL, performance regression tests.                                                                                               |

### File organization conventions

- **One folder per module** — each function, hook, or component lives in a named kebab-case folder with `index.ts` (implementation) and `index.spec.ts` (tests) co-located.
- **Barrel files** — only three exist: `src/index.ts`, `src/ease/index.ts`, `src/react/index.ts`. These are entry points, not organizational barrels. Don't add more.
- **`_internal/` directories** — shared helpers consumed within the same layer. Never exported publicly. Never imported cross-layer.
- **New modules follow the existing pattern** — look at any sibling folder. Match the structure.

### Entry points

| Export    | Source               | Contents                                                            |
| --------- | -------------------- | ------------------------------------------------------------------- |
| `.`       | `src/index.ts`       | createTicker, createSight, createLoop, easing, errors               |
| `./ease`  | `src/ease/index.ts`  | Easing + math utilities (clamp, lerp, remap, easeOutCubic)          |
| `./react` | `src/react/index.ts` | useLoop, useTween, useCanvas, useSight, usePresence, Presence, Swap |

## Performance Contracts

These are ironclad. Every module must satisfy them. No exceptions.

### Hot-path rules (per-frame code)

- **Zero allocations per frame** — no object/array/string creation, no closures, no `.map()`, `.filter()`, spread operators, or template literals in the onTick path
- **FrameState mutated in place** — sealed shape, V8 stays on monomorphic IC path
- **No try/catch wrapping onTick** — defeats TurboFan optimization
- **Stable function references** — frame callback created once, never recreated
- **No debug logging in hot path** — zero string ops unless devtools active

### Lifecycle rules

- **Strong pause** — `cancelAnimationFrame()` stops scheduling entirely. Zero callbacks fire. Not the "weak pause" pattern of rAF + early return.
- **Frame-locked shared clock** — one `performance.now()` read per rAF frame. All tickers read from this shared value. No visual desync.
- **Delta clamped at 40ms** — prevents teleport on resume after long pause
- **Pause-aware elapsed** — `frame.elapsed` freezes during pause, resumes from where it left off

### Browser API rules

- **Zero forced reflows** — never call `getBoundingClientRect()`, `offsetWidth`, `scrollWidth`, `getComputedStyle()`, or any property that triggers synchronous layout
- **All dimensions from ResizeObserver** (async, compositor-aligned)
- **All visibility from IntersectionObserver** (async, post-paint)

### React rules

- **Zero re-renders from frame loop** — all per-frame state lives in refs. `onTick`/`onDraw` write to refs or DOM directly.
- **Only phase changes trigger setState** — infrequent lifecycle transitions, not per-frame
- **useStableCallback for all consumer callbacks** — prevents loop restart on re-render

## Performance Testing

`src/tests/perf.spec.ts` contains structural and budget assertions that gate regressions:

1. **Zero-allocation** — `FrameState` is the exact same object reference across 10,000 frames
2. **Frame budget** — per-frame math overhead stays under 0.1ms

## Code Style

| Convention            | Rule                                                             |
| --------------------- | ---------------------------------------------------------------- |
| File and folder names | `kebab-case`                                                     |
| Type names            | `PascalCase`                                                     |
| Function names        | `camelCase`                                                      |
| `any`                 | Banned. Use `unknown` and narrow.                                |
| Import extensions     | No `.js` extensions                                              |
| Index imports         | No `/index` — directory index is inferred                        |
| Type imports          | Use `import type` / `export type` for type-only                  |
| Barrel files          | Separate API exports from type exports (API first, types second) |
| JSDoc                 | On public APIs: explain _what_ and _why_, not _how_              |
| Inline comments       | Only where code cannot speak for itself                          |
| Boolean props         | Banned. Use string unions (e.g. `enter: 'animate' \| 'instant'`) |

## Testing Conventions

- **Framework**: Vitest with `globals: true`, `environment: 'jsdom'`
- **Location**: co-located `index.spec.ts` (or `.spec.tsx`) next to `index.ts`
- **Shared mocks**: `src/__mocks__/` (IO, RO, MQL mocks)

## Dependency Rules

- **Zero runtime dependencies** shipped to consumers
- Never add runtime dependencies without explicit approval
- All dependencies pinned to exact versions

## Key Design Rules

1. **No barrel files** except the three designated entry points (`src/index.ts`, `src/ease/index.ts`, `src/react/index.ts`).
2. **`_internal/` is never exported** publicly.
3. **Zero per-frame allocations** — FrameState is reused, no closures in the hot path.
4. **React is optional** — peer dep marked optional; core works without React.
5. **No circular imports** — `ease/` has no deps, `core/` depends on `ease/` and `_internal/`, `react/` depends on `core/`. Never import upward.
6. **Co-located tests** — every module has a sibling `.spec.ts(x)` file.
7. **Observer pooling** — IO keyed by serialized options, RO is a singleton, MQL keyed by query string. Never create raw observers outside the pool.
8. **Phases + reasons** — every state machine exposes both. Phase is _what_ state. Reason is _why_ that state.

## How to Add New Features

### New core primitive

1. Create `src/core/<name>/index.ts` with implementation
2. Create `src/core/<name>/index.spec.ts` with tests
3. Add exports to `src/index.ts` (API section, then types section)
4. Run `pnpm validate`

### New React hook

1. Create `src/react/<use-name>/index.ts` (or `.tsx`) with implementation
2. Create `src/react/<use-name>/index.spec.ts` (or `.spec.tsx`) with tests
3. Add exports to `src/react/index.ts` (API section, then types section)
4. Run `pnpm validate`

### New easing function

1. Add the function to `src/ease/index.ts` — must be pure (`number → number`), no side effects
2. Add test cases to `src/ease/index.spec.ts`
3. Add export to `src/index.ts` (it re-exports from ease)
4. Run `pnpm validate`
