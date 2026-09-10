# Core library instructions

This package publishes `@usephase/core`. Run commands from the repository root.

## Architecture

- `src/ease/` is pure math with no browser APIs.
- Other public folders in `src/` are framework-agnostic primitives.
- `src/_internal/` is private implementation; `src/internal.ts` is the binding-only `@usephase/core/internal` port.
- Keep the only barrels at `src/index.ts`, `src/ease/index.ts`, and `src/internal.ts`. Barrels contain pure re-exports.
- Add a helper to the internal port only when more than one `@usephase/*` binding needs it. Any port change requires a core minor release.

## Performance contracts

- Allocate nothing per frame. Reuse the sealed `FrameState` object and stable callback references.
- Do not wrap `onTick` in `try/catch`. Input dispatch isolates consumer exceptions and rethrows after both stages complete; a tick exception retains precedence.
- Strong pause cancels scheduling. Tickers using `phase.clock@2` in one JavaScript global share one browser frame and timestamp, including separately bundled copies.
- Limit delayed `frame.delta` to 40ms without an FPS limit, or one interval plus 40ms with a limit.
- Flush queued input-stage work before frame-loop callbacks.
- Avoid synchronous layout reads except the documented pointer and scroll measurements. Use shared observer pools for visibility and dimensions.

## Tests and size

- Co-locate unit and browser specs with each module.
- Native browser specs may import only `@usephase/testing/browser`; they must not use simulated browser APIs.
- `src/__tests__/perf.spec.ts` gates frame reuse and dispatch overhead.
- Every public export has a `.size-limit.json` entry. Keep unrelated code out of an export's tree.
- Run `pnpm --filter @usephase/core typecheck`, targeted unit specs, and `pnpm --filter @usephase/core size` during development.

## Public API

- Document observable behavior, constraints, errors, and side effects with JSDoc.
- Every state machine with phases exposes `onPhaseChange`.
- Preserve dependency direction: ease has no dependencies; primitives depend only on ease and core internals; framework bindings depend on core.
- Keep the package free of runtime dependencies and framework peers.

Public API changes require the matching `skills/phase/references/` update. Follow the root [`../../AGENTS.md`](../../AGENTS.md) for release and validation rules.
