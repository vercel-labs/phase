# phase agent instructions

> **Status: Alpha.** APIs are evolving rapidly. Breaking changes happen without notice.

## Repository overview

Animation infrastructure for the web. Lifecycle-aware primitives that compose visibility, timing, reduced motion, and quality signals into coherent state machines with debuggable transitions.

Tech stack: TypeScript, tsdown (bundler), vitest (tests), oxlint (linting), oxfmt (formatting), lefthook (pre-commit hooks).

## Commands

```bash
pnpm build             # Build (tsdown)
pnpm test              # Run tests (vitest)
pnpm typecheck         # Type check (tsc --noEmit)
pnpm lint              # Lint (oxlint)
pnpm lint:fix          # Lint and auto-fix (oxlint --fix)
pnpm format            # Check formatting (oxfmt --check)
pnpm format:fix        # Fix formatting (oxfmt)
pnpm size              # Build and check bundle sizes (size-limit)
pnpm size:readme       # Build and update README.md bundle size table
pnpm validate          # Run typecheck, lint, format, test, and skill:check in parallel
pnpm skill:check       # Verify every public export has a skill reference (drift guard)
pnpm skill:build       # Regenerate skills/phase/AGENTS.md + metadata.json from SKILL.md
pnpm skill:package     # Rebuild the deterministic skills/phase/dist/phase-skill.zip
```

**When these run automatically:**

- `skill:check` runs as part of `pnpm validate` and in CI on every PR.
- `skill:build` + `skill:package` run on pre-commit (via lefthook) whenever a file under `skills/phase/` is staged, and Lefthook re-stages the regenerated `AGENTS.md`, `metadata.json`, and zip automatically. You rarely need to run them by hand.
- CI re-verifies all of these on every PR; the release workflow re-verifies them before publishing. A stale generated file fails the build.

## Architecture

Two-layer design: core primitives (framework-agnostic) and React bindings.

### Top-level folders

| Folder   | Purpose                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ease/`  | Pure math (easing functions, clamping, interpolation). No browser APIs, no React. Safe anywhere.                                                                                       |
| `core/`  | Framework-agnostic primitives (ticker, sight, loop). Browser APIs live here. `_internal/` holds shared infrastructure (error factory, observer pools) that is never exported publicly. |
| `react/` | React hooks and components. Each hook or component gets its own folder. Depends on `core/` for the underlying primitives. `_internal/` holds shared hooks not exported publicly.       |
| `tests/` | Shared test infrastructure (mock factories for IO/RO/MQL, performance regression tests).                                                                                               |

### File organization conventions

- **One folder per module.** Each function, hook, or component lives in a named kebab-case folder with `index.ts` (implementation) and `index.spec.ts` (tests) co-located.
- **Barrel files.** Only three exist: `src/index.ts`, `src/ease/index.ts`, `src/react/index.ts`. These serve as entry points. Don't add more.
- **`_internal/` directories.** Keep `_internal/` helpers within their layer. Don't export them publicly or import them across layers.
- **New modules follow the existing pattern.** Look at any sibling folder. Match the structure.

### Entry points

| Export    | Source               | Contents                                                                               |
| --------- | -------------------- | -------------------------------------------------------------------------------------- |
| `.`       | `src/index.ts`       | createTicker, createSight, createLoop, createScrollProgress, easing, errors            |
| `./ease`  | `src/ease/index.ts`  | Easing + math utilities (clamp, lerp, remap, easeOutCubic)                             |
| `./react` | `src/react/index.ts` | useLoop, useTween, useCanvas, useSight, useScrollProgress, usePresence, Presence, Swap |

## Performance contracts

Every module must satisfy these performance contracts without exception.

### Hot-path rules (per-frame code)

- **Zero allocations per frame.** No object/array/string creation, no closures, no `.map()`, `.filter()`, spread operators, or template literals in the onTick path.
- **FrameState mutated in place.** Sealed shape, V8 stays on monomorphic IC path.
- **No try/catch wrapping onTick.** Defeats TurboFan optimization.
- **Stable function references.** Frame callback created once, never recreated.
- **No debug logging in hot path.** Zero string ops unless devtools active.

### Lifecycle rules

- **Strong pause.** `cancelAnimationFrame()` stops scheduling entirely. Zero callbacks fire, and the loop fully halts (no rAF + early return).
- **Frame-locked shared clock.** One `performance.now()` read per rAF frame. All tickers read from this shared value. No visual desync.
- **Delta clamped at 40ms.** Prevents teleport on resume after long pause.
- **Pause-aware elapsed.** `frame.elapsed` freezes during pause, resumes from where it left off.

### Browser API rules

- **Zero forced reflows.** Never call `getBoundingClientRect()`, `offsetWidth`, `scrollWidth`, `getComputedStyle()`, or any property that triggers synchronous layout.
- **All dimensions from ResizeObserver** (async, compositor-aligned)
- **All visibility from IntersectionObserver** (async, post-paint)

### React rules

- **Zero re-renders from frame loop.** All per-frame state lives in refs. `onTick`/`onDraw` write to refs or DOM directly.
- **Only phase changes trigger setState.** Infrequent lifecycle transitions, not per-frame.
- **Per-frame callbacks live in a synced ref.** `onTick`/`onDraw` are stored via `useSyncedRef` so their identity never triggers a loop restart. Use `useStableCallback` for consumer callbacks that need a stable identity elsewhere (e.g. props to memoized children).

## Performance testing

`src/tests/perf.spec.ts` contains structural and budget assertions that gate regressions:

1. **Zero-allocation.** `FrameState` is the exact same object reference across 10,000 frames.
2. **Frame budget.** Per-frame math overhead stays under 0.1ms.

## Bundle size

Minimal footprint is a core promise of phase. Every public export is individually measured with [Size Limit](https://github.com/ai/size-limit) and budgeted in `.size-limit.json`. CI enforces limits on every PR.

- **Check individual exports, not barrels.** Size-limit tests each named export from `dist/`. Ease is the exception (single entry, < 300 B).
- **Run `pnpm size` before and after changes.** Any new export, refactor, or dependency change can shift sizes. Run size locally to catch regressions before CI does.
- **Avoid transitive dependency linking.** Each export should only pull in what it directly needs. Don't import from a module only for a constant if inlining it avoids dragging in unrelated code.
- **When adding a new export**, add a corresponding entry to `.size-limit.json` with `name`, `path`, `import`, and `limit`. Set the limit to ~20% above measured size for exports under 500 B, ~10% for everything else.
- **Keep error strings concise.** Error `reason` and `fix` fields ship in the bundle. Say what's needed, nothing more.

## Code style

| Convention            | Rule                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| File and folder names | `kebab-case`                                                                                                                                    |
| Type names            | `PascalCase`                                                                                                                                    |
| Function names        | `camelCase`                                                                                                                                     |
| `any`                 | Banned. Use `unknown` and narrow.                                                                                                               |
| Import extensions     | No `.js` extensions                                                                                                                             |
| Index imports         | No `/index` (directory index is inferred)                                                                                                       |
| Type imports          | Use `import type` / `export type` for type-only                                                                                                 |
| Barrel files          | Separate API exports from type exports (API first, types second)                                                                                |
| JSDoc                 | On public APIs: explain _what_ and _why_, not _how_                                                                                             |
| Inline comments       | Only where code cannot speak for itself                                                                                                         |
| Boolean props         | Banned. Use string unions (e.g. `enter: 'animate' \| 'instant'`). Exception: `enabled` is boolean across all hooks (binary on/off, not a mode). |
| Exported type names   | Must not shadow global `lib.dom` types (e.g. avoid exporting `MutationCallback` when the DOM defines one)                                       |

## Testing conventions

- **Framework**: Vitest with `globals: true`, `environment: 'jsdom'`
- **Location**: co-located `index.spec.ts` (or `.spec.tsx`) next to `index.ts`
- **Shared mocks**: `src/__mocks__/` (IO, RO, MQL mocks)

## Dependency rules

- **Zero runtime dependencies** shipped to consumers
- Never add runtime dependencies without explicit approval
- All dependencies pinned to exact versions

## Key design rules

1. **No barrel files** except the three designated entry points (`src/index.ts`, `src/ease/index.ts`, `src/react/index.ts`). Barrels must be **pure re-exports only** (no declarations, logic, or top-level side effects).
2. **`_internal/` is never exported** publicly.
3. **Zero per-frame allocations.** FrameState is reused, no closures in the hot path.
4. **React is optional.** Peer dep marked optional; core works without React.
5. **No circular imports.** `ease/` has no deps, `core/` depends on `ease/` and `_internal/`, `react/` depends on `core/`. Never import upward.
6. **Co-located tests.** Every module has a sibling `.spec.ts(x)` file.
7. **Observer pooling.** IO keyed by serialized options, RO is a singleton, MQL keyed by query string. Never create raw observers outside the pool.
8. **Phases + reasons.** Every state machine exposes both. Phase describes _what_ state; reason describes _why_. Core primitives with phases must expose an `onPhaseChange` callback so React hooks can subscribe without polling. React hooks must use `useState` for phase/reason (reactive by default) and provide a transient (zero-re-render) escape hatch via a callback option, matching the `useSight` dual-mode pattern.

## Admission criteria

Every proposed export must pass all four criteria. If any fails, the solution belongs in the **skill** as a pattern or recipe, not in the library as shipped code.

1. **Wraps a browser API that is easy to misuse.** The raw API causes measurable perf regressions without careful handling (forced reflows, leaked observers, unbatched callbacks, always-on scheduling).
2. **Manages a lifecycle.** The primitive must manage at least one of: browser lifecycle (visibility-pausing, reduced-motion, observer pooling, rAF-batching), render lifecycle (preventing unnecessary re-renders, stable callback identities), or CSS containment lifecycle (`content-visibility` state). A pure utility that works identically regardless of any lifecycle does not belong here.
3. **Makes the safe path shorter than the raw path.** Using the primitive is less code and less error-prone than using the browser API directly. The wrong thing is impossible or harder than the right thing.
4. **Stays individually lean.** Every export is measured and budgeted in `.size-limit.json`. CI rejects regressions. An export must pull in only what it directly needs, never drag in unrelated code through transitive imports. There is no universal ceiling, but every byte must justify itself.

Infrastructure exports (errors, easing math) support the primitives above and do not individually need to pass criteria 1-2. They exist because the lifecycle-aware primitives depend on them.

### What does NOT belong in phase

- CSS linting or build-time stylesheet analysis
- Bundler or code-splitting configuration
- Design system components or modal layers
- General DOM scheduling beyond rAF batching

When a gap exists but fails the criteria, close it in the skill: add an audit rule, a recipe, or a scanner signal.

### Export taxonomy

Every export falls into one category. New exports must fit an existing category or justify a new one.

| Category    | Exports                                                                                                                                                                                                                                  | What they wrap                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Timing      | createTicker, createLoop, useTween, useLoop, useCanvas                                                                                                                                                                                   | rAF, frame clock                                                    |
| Observation | createSight, createScrollProgress, createRenderState, createDevicePixelRatio, useSight, useScrollProgress, useSize, useContainerQuery, useMediaQuery, useRenderState, useDevicePixelRatio, usePrefersReducedMotion, prefersReducedMotion | IO, RO, MQL, contentvisibilityautostatechange, matchMedia           |
| Lifecycle   | createLifecycle, useLifecycle, whenIdle, useIdle, useWhenIdle                                                                                                                                                                            | IO + MQL + rIC composed into activation signals                     |
| Composition | Presence, usePresence, Swap, WhenVisible, WhenIdle, Defer                                                                                                                                                                                | Mount/unmount orchestration with transition coordination            |
| Math        | clamp, clamp01, lerp, inverseLerp, remap, easeOutCubic, easeOutQuart, easeOutBack, easeInOutCubic, linear                                                                                                                                | Pure functions, no browser API                                      |
| Utility     | useSyncedRef, useStableCallback                                                                                                                                                                                                          | React ref/callback patterns needed by phase internals and consumers |

## How to add new features

### New core primitive

1. Create `src/core/<name>/index.ts` with implementation
2. Create `src/core/<name>/index.spec.ts` with tests
3. Add exports to `src/index.ts` (API section, then types section)
4. Add a size-limit entry to `.size-limit.json`. Run `pnpm size` and set the limit to ~20% above measured size for exports under 500 B, ~10% for larger exports.
5. Add a skill reference at `skills/phase/references/<name>.md` following `_template.md`
6. If the primitive has phases: expose `onPhaseChange` callback in options (see rule 8)
7. Verify exported type names do not collide with `lib.dom` globals
8. Run `pnpm format:fix && pnpm validate && pnpm skill:check`

### New React hook

1. Create `src/react/<use-name>/index.ts` (or `.tsx`) with implementation
2. Create `src/react/<use-name>/index.spec.ts` (or `.spec.tsx`) with tests
3. Add exports to `src/react/index.ts` (API section, then types section)
4. Add a size-limit entry to `.size-limit.json` with `"ignore": ["react"]`. Run `pnpm size` and set the limit to ~20% above measured size for exports under 500 B, ~10% for larger exports.
5. Add a skill reference at `skills/phase/references/<use-name>.md` following `_template.md`
6. If the hook exposes phase state: use `useState` (reactive by default), expose `phaseRef`/`phaseReasonRef` (always-current via ref), and provide a transient callback option that suppresses `setState` (see rule 8, match the `useSight` dual-mode pattern)
7. No boolean props except `enabled`. Use string unions for modes and behaviors.
8. Verify exported type names do not collide with `lib.dom` globals
9. Run `pnpm format:fix && pnpm validate && pnpm skill:check`

### New easing function

1. Add the function to `src/ease/index.ts`. Must be pure (`number → number`), no side effects.
2. Add test cases to `src/ease/index.spec.ts`
3. Add export to `src/index.ts` (it re-exports from ease)
4. Run `pnpm size`. Ease is checked as a single module; bump the limit in `.size-limit.json` if needed.
5. Update `skills/phase/references/ease.md` with the new function
6. Run `pnpm format:fix && pnpm validate && pnpm skill:check`

## Before committing

Run this sequence before every commit. Lefthook covers some of it on pre-commit, but `--amend` and non-skill changes can skip hooks. Do it yourself every time.

```bash
pnpm lint:fix            # oxlint auto-fix
pnpm format:fix          # oxfmt (including .md files)
pnpm size:readme         # regenerate README bundle-size table
pnpm skill:build         # regenerate AGENTS.md + metadata.json from SKILL.md
pnpm skill:package       # regenerate phase-skill.zip
```

`size:readme` and `skill:build`/`skill:package` produce generated files that CI diffchecks. A stale artifact fails the build.

Run `pnpm validate` before opening or updating a PR, not on every commit.

## Versioning and changelog

When asked to bump the version (patch, minor, or major):

1. Bump `version` in `package.json`.
2. Bump `version` in `skills/phase/SKILL.md` frontmatter (skill version is independent, but bump it alongside package changes that alter the public API or skill references).
3. **Prepend** a new section to `CHANGELOG.md` under the new version number. Keep all previous entries intact (newest first, oldest last). Follow the existing format: `## X.Y.Z`, then `### Patch Changes` / `### Minor Changes` / `### Major Changes`, then bullet points.
4. Never overwrite or truncate older changelog entries.

## Skill sync

The `skills/phase/` directory contains an agent skill that documents the public API. It must stay in sync with the source.

### Source of truth and generated files

- **Hand-edit:** `SKILL.md` and `references/*.md`. `SKILL.md` frontmatter is the single source of truth for the skill's `name`, `description`, `license`, `version`, `author`, and `abstract`.
- **Never hand-edit (generated by `skill:build` / `skill:package`):** `AGENTS.md`, `metadata.json`, and `dist/phase-skill.zip`. To change the version, edit `SKILL.md` frontmatter and rebuild. `metadata.json` is derived from it, so there's only ever one place to update.
- The skill `version` is intentionally independent of the package `version`. They evolve on different cadences. Don't sync them.

### When to update skill references

After any change to:

- **Option names, types, or defaults.** Update the corresponding `skills/phase/references/<export>.md`.
- **Phase or reason enum values.** Update the phases/reasons tables in the reference.
- **The canonical CSS pattern** (`data-[enter=animate]:starting:...`, `data-[phase=exiting]:...`): grep `skills/phase/references/` and update all occurrences.
- **The "choosing a primitive" table** in `README.md`: also update the matching table in `skills/phase/SKILL.md`.
- **Adding or removing exports.** `pnpm skill:check` will catch this (exits non-zero on uncovered export or orphan reference).

### After updating skill references

```bash
pnpm format:fix               # format everything including markdown
pnpm skill:check              # verify no drift between barrels and references
pnpm skill:build              # regenerate skills/phase/AGENTS.md + metadata.json
pnpm skill:package            # regenerate skills/phase/dist/phase-skill.zip
```

(Pre-commit runs `skill:build` + `skill:package` automatically when skill files are staged, so these are usually already done for you.)

### What to exclude from skill references

- **Bundle sizes.** These are auto-maintained in the README via `pnpm size:readme`. Do not duplicate in skill references.
- **Implementation details.** The skill teaches correct usage patterns, not internal architecture.
- **Version-specific workarounds.** If it's a bug, fix it; don't document the workaround in the skill.
