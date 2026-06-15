# phase — Agent Instructions

## Repository Overview

This is the `phase` package — lifecycle-aware animation infrastructure for the web.

Tech stack: TypeScript 6+, tsdown (bundler), vitest (tests), oxlint (linting), oxfmt (formatting), lefthook (pre-commit hooks).

## Essential Commands

```bash
pnpm build             # Build (tsdown)
pnpm test              # Run tests (vitest)
pnpm test:perf         # Run perf tests (vitest)
pnpm typecheck         # Type check (tsc --noEmit)
pnpm lint              # Lint (oxlint)
pnpm lint:fix          # Lint and auto-fix (oxlint --fix)
pnpm format            # Check formatting (oxfmt --check)
pnpm format:fix        # Fix formatting (oxfmt)
pnpm validate          # Run typecheck, lint, format, and test in parallel
```

## Architecture

Two-layer design: core primitives and React bindings.

```
src/
├── index.ts          # Core barrel (ease, tick, sight, loop, errors)
├── react.ts          # React barrel (hooks, components)
├── core/
│   ├── ease/         # Easing functions + math utilities
│   ├── tick/         # Shared rAF clock, zero-alloc FrameState
│   ├── sight/        # Visibility tracking via IO + document visibility
│   ├── loop/         # Ticker + sight + reduced-motion = lifecycle loop
│   ├── error/        # PhaseError re-exports
│   └── _internal/
│       └── pool/     # Singleton observer pools (IO, MQL, RO)
├── react/
│   ├── presence/     # <Presence> component
│   ├── swap/         # <Swap> compound component
│   ├── use-canvas/   # DPR-aware canvas hook
│   ├── use-container-query/
│   ├── use-loop/     # Ref-based animation loop hook
│   ├── use-media/    # Media query subscription
│   ├── use-presence/ # Mount/unmount lifecycle hook
│   ├── use-sight/    # Visibility phase hook
│   ├── use-size/     # Element dimensions via RO
│   ├── use-stable-callback/
│   ├── use-synced-ref/
│   ├── use-tween/    # State-based value tweening
│   └── _internal/    # Internal hooks (useUpdateEffect)
└── tests/
    ├── mocks.ts      # Shared IO/RO/MQL test mocks
    └── perf.spec.ts  # Zero-allocation + frame budget assertions
```

### Entry Points

| Export    | Source         | Contents                                                                  |
| --------- | -------------- | ------------------------------------------------------------------------- |
| `.`       | `src/index.ts` | createTicker, createSight, createLoop, easing, errors                     |
| `./react` | `src/react.ts` | useLoop, useTween, useCanvas, useSight, usePresence, Presence, Swap, etc. |

### Core Concepts

- **createTicker** — Shared rAF clock with phase transitions (idle → running → stopped). Zero allocations per frame.
- **createSight** — Visibility observer combining IntersectionObserver + document.visibilitychange + bfcache.
- **createLoop** — Combines ticker + sight + prefers-reduced-motion into one lifecycle-aware animation primitive.
- **Observer Pools** — Singleton IO/RO/MQL instances shared across all consumers to minimize browser API overhead.
- **React hooks** use refs for hot-path values; `setState` only on phase transitions.

## Performance Testing

`src/tests/perf.spec.ts` contains structural and budget assertions that gate regressions. These are **not** benchmarks — they prove invariants:

1. **Zero-allocation** — `FrameState` is the exact same object reference across 10,000 frames. No per-frame allocations.
2. **Frame budget** — per-frame overhead of the hot-path math (clamp, ease, lerp) stays under 0.1ms, leaving 16.57ms for the consumer.

Run perf tests in isolation:

```bash
pnpm test -- src/tests/perf.spec.ts
```

Tests use `vi.resetModules()` + dynamic `await import(...)` to get a fresh module singleton per test (the ticker maintains a shared rAF clock at module scope). This pattern is required for any test that exercises singleton state.

## Key Design Rules

1. **No barrel files** except the two designated entry points (`index.ts`, `react.ts`).
2. **`_internal/` is never exported** publicly.
3. **Zero per-frame allocations** — FrameState is reused, no closures in the hot path.
4. **One runtime dependency** — `@vercel/error` for structured errors.
5. **React is optional** — peer dep marked optional; core works without React.
6. **Avoid circular dependencies**: never introduce circular deps between modules.
7. **Co-located tests** — every module has a sibling `.spec.ts(x)` file.
