# Core library instructions

This package publishes `@usephase/core`. Run commands from the repository root.

## Architecture

- `src/ease/` is pure math with no browser APIs.
- Other public folders in `src/` are framework-agnostic primitives.
- `src/_internal/` contains package-private implementation code; `src/internal.ts` is the binding-only `@usephase/core/internal` entry point.
- Keep the only barrels at `src/index.ts`, `src/ease/index.ts`, and `src/internal.ts`. Barrels contain pure re-exports.
- Add a helper to `@usephase/core/internal` only when more than one `@usephase/*` binding needs it. Any change to that entry point requires a minor release of `@usephase/core`.

## Performance contracts

- Allocate nothing per frame. Reuse the sealed `FrameState` object and stable callback references.
- Do not wrap `onTick` in `try/catch`. Input dispatch catches consumer exceptions and rethrows the first after frame-loop dispatch; if a ticker callback throws, that exception takes precedence.
- Strong pause cancels scheduling. Tickers using `phase.clock@2` in one JavaScript global share one browser frame and timestamp, including separately bundled copies.
- Limit delayed `frame.delta` to 40ms without an FPS limit, or one interval plus 40ms with a limit.
- Flush queued input-stage work before frame-loop callbacks.
- Avoid synchronous layout reads except the documented pointer and scroll measurements. Use shared observer pools for visibility and dimensions.

## Tests and size

- Co-locate unit and browser specs with each module.
- Native browser specs may import shared test helpers only from `@usephase/testing/browser`; they must exercise native browser APIs instead of simulated ones.
- `src/__tests__/perf.spec.ts` gates frame reuse and dispatch overhead.
- Every public export has a `.size-limit.json` entry. Keep unrelated code out of an export's tree.
- Run `pnpm --filter @usephase/core typecheck`, targeted unit specs, and `pnpm --filter @usephase/core size` during development.

## Public API

- Document observable behavior, constraints, errors, and side effects with JSDoc.
- Every state machine with phases exposes `onPhaseChange`.
- Preserve dependency direction: ease has no dependencies; primitives depend only on ease and core internals; framework bindings depend on core.
- Keep the package free of runtime dependencies and framework peers.

Public API changes require the matching `skills/phase/references/` update. Follow the root [`../../AGENTS.md`](../../AGENTS.md) for release and validation rules.
