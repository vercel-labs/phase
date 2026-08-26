# Keep workspace packages under packages

## Context

`@usephase/examples` has its own dependencies, exports, scripts, tests, and typecheck command. Keeping it at the repository root would make it the only reusable workspace package outside `packages/`.

## Decision

Keep reusable workspace packages under `packages/`. The examples package lives at `packages/examples`. Runnable applications stay under `apps/`, and files that users install directly can keep their stable root paths.

## Reason

One location makes package ownership easy to understand and removes the need for a special workspace entry. This move happens before the browser tests, documentation, and snippet tools depend on the old path.

## Consequences

Tools that read example source use `packages/examples`. Runtime code continues to import `@usephase/examples`, so its import paths do not change.
