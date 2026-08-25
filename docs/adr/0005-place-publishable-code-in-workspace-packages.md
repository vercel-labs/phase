# Place publishable code in workspace packages

## Context

The repository root combined the published library, repository orchestration, and the installable agent skill's source and artifacts. Adding examples and applications there would blur package ownership and let nested evaluation fixtures be discovered as workspaces.

## Decision

Use a pnpm workspace with explicit `packages/*`, `examples`, and `apps/*` entries. The only publishable package, `phase`, lives at `packages/phase`; the private root owns orchestration and repository-wide checks. `skills/phase/` remains root-level content with committed artifacts so direct directory installs and the `skills/phase/dist/phase-skill.zip` download path remain stable. The scanner, skill scripts, and evaluations will move together into one private workspace package because the skill archive is the scanner's only consumer.

## Reason

Package-local source, configuration, README, and license make npm packing independent of parent-directory behavior. Explicit workspace entries prevent fixtures under `evals/` from becoming packages, while keeping skill content at the root preserves both existing consumer installation contracts.

## Consequences

Each package owns its build, test, typecheck, and size commands. Root commands orchestrate packages or run repository-level checks; they do not reach into package internals to perform package work.
