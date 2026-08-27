# phase agent instructions

> **Status: Alpha.** APIs are evolving rapidly. Breaking changes happen without notice.

## Repository overview

Animation infrastructure for the web. Lifecycle-aware primitives compose visibility, timing, reduced motion, and quality signals into coherent state machines with debuggable transitions.

Run commands from the repository root. The repository has four ownership boundaries:

- [`packages/phase/`](./packages/phase/AGENTS.md) owns the published library, performance contracts, and library implementation rules.
- [`packages/skill/`](./packages/skill/AGENTS.md) owns scanner source, evals, and skill-maintainer tooling.
- [`packages/examples/`](./packages/examples/CONVENTIONS.md) owns the shared React examples and their rules.
- `skills/phase/` contains only installable skill content and committed generated artifacts.

The root `README.md` tells the package and repository story; `packages/phase/README.md` is the npm package summary.

Scanner, audit, or eval changes must use the canonical vocabulary in [`CONTEXT.md`](./CONTEXT.md). Durable architecture decisions live in [`docs/adr/`](./docs/adr/README.md).

## Commands

```bash
pnpm build             # Build workspace packages
pnpm test              # Run all tests
pnpm typecheck         # Type check workspace packages
pnpm lint              # Lint the repository
pnpm lint:fix          # Lint and auto-fix
pnpm format            # Check formatting
pnpm format:fix        # Fix formatting
pnpm size              # Check library bundle sizes
pnpm size:readme       # Update the library README bundle-size table
pnpm goldens           # Regenerate scanner goldens and the audit sample
pnpm validate          # Run the complete local validation gate
pnpm skill:check       # Check skill coverage, sync, and distribution safety
pnpm skill:build       # Bundle the scanner and regenerate skill metadata/docs
pnpm skill:package     # Rebuild the deterministic skill zip
```

## Automation

- `skill:check` runs as part of `pnpm validate` and in CI on every PR.
- `skill:build` and `skill:package` run on pre-commit whenever `skills/phase/` or `packages/skill/` changes. Lefthook re-stages `metadata.json`, `scripts/scan.mjs`, the generated audit regions, and the zip.
- The examples manifest is regenerated and staged on pre-commit whenever `packages/examples/` changes.
- CI and the release workflow rebuild committed artifacts and fail on a diff.
- Tree-writing tasks (`goldens`, `skill:build`, and `skill:package`) stay uncached. A cache hit would skip regeneration and make a freshness check inspect the wrong tree.

## Before committing

Run this sequence before every commit. Lefthook covers part of it, but generated files must already be current before the hook runs.

```bash
pnpm lint:fix
pnpm format:fix
pnpm size:readme
pnpm skill:build
pnpm skill:package
```

Run `pnpm validate` before opening or updating a PR.

## Versioning and changelog

Package and skill versions are independent release signals:

- Bump `packages/phase/package.json` for changes to shipped library source, build output, or consumer-facing package metadata.
- Do not bump the package for skill-only, test-only, workflow-only, or README-only changes. Root `README.md` changes are repository-only; changes to `packages/phase/README.md` reach npm with the next package release. Use an intentional patch release only when an npm-facing documentation correction must ship immediately.
- Bump the version in `skills/phase/SKILL.md` whenever installable skill content changes.
- The release workflow validates every merge to `main`, but publishes only package versions not already on npm. An existing version is a successful no-op.

When asked to bump the package version:

1. Bump `version` in `packages/phase/package.json`.
2. Bump `version` in `skills/phase/SKILL.md` when the package change alters the public API or skill references.
3. Prepend a section to `CHANGELOG.md` under the new version number. Keep all older entries.
4. Use the existing `## X.Y.Z` and `### Patch Changes` / `### Minor Changes` / `### Major Changes` format.
5. Keep each entry to what changed and never overwrite older changelog entries.

Package and skill naming follows [`ADR 0007`](./docs/adr/0007-reserve-unscoped-names-for-published-packages.md): unscoped names are publishable, while `@usephase/*` workspace packages are internal and must set `"private": true`.
