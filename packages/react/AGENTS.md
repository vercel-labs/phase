# React binding instructions

This package publishes `@usephase/react`. Run commands from the repository root. Read [`../core/AGENTS.md`](../core/AGENTS.md) before changing shared lifecycle, frame-loop, observer, or size behavior.

## Boundaries

- Import application-facing primitives and types from `@usephase/core`.
- Import binding-only pools and error constructors from `@usephase/core/internal`. Applications must not use that port.
- Keep React as a required peer and `@usephase/core` as a regular `workspace:^` dependency.
- Keep `'use client'` as the first statement in `src/index.ts`.

## React contracts

- Frame loops write per-frame state to refs or the DOM, never React state.
- Only phase transitions may call `setState`.
- Store `onTick` and `onDraw` in `useSyncedRef`. Use `useStableCallback` when a consumer callback needs stable identity outside the loop.
- Only `enabled` may be a boolean behavior prop. Model other behavior with string unions.

## Tests and size

- Co-locate unit and browser specs with their modules. Native browser specs may import only `@usephase/testing/browser`; they must exercise native browser APIs instead of simulated ones.
- `src/perf.spec.ts` gates the zero-rerender frame-loop contract.
- Every public export has a `.size-limit.json` entry. React bundle checks externalize React and `@usephase/core`.
- Run `pnpm --filter @usephase/react typecheck`, targeted unit specs, and `pnpm --filter @usephase/react size` during development.

Public API changes require the matching `skills/phase/references/` update. Follow the root [`../../AGENTS.md`](../../AGENTS.md) for release and validation rules.
