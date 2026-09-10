# phase agent instructions

> **Status: Alpha.** APIs are evolving rapidly. Breaking changes happen without notice.

## Repository overview

Animation infrastructure for the web. Lifecycle-aware primitives compose visibility, timing, reduced motion, and quality signals into coherent state machines with debuggable transitions.

Run commands from the repository root. The repository has seven ownership boundaries:

- [`packages/core/`](./packages/core/AGENTS.md) owns the framework-agnostic runtime and shared performance contracts.
- [`packages/react/`](./packages/react/AGENTS.md) owns the React binding and its package contract.
- [`packages/testing/`](./packages/testing/AGENTS.md) owns private shared test helpers.
- `packages/cli/` owns the private npm command package and its package-level tests and documentation.
- [`packages/skill/`](./packages/skill/AGENTS.md) owns scanner source, evals, and skill-maintainer tooling.
- [`packages/examples/`](./packages/examples/CONVENTIONS.md) owns the shared React examples and their rules.
- `skills/phase/` contains only installable skill content and committed generated artifacts.

The root `README.md` documents the toolkit and repository. Each publishable package owns its npm summary in its package directory.

Scanner, audit, or eval changes must use the canonical vocabulary in [`CONTEXT.md`](./CONTEXT.md). Durable architecture decisions live in [`docs/adr/`](./docs/adr/README.md).

## Commands

```bash
pnpm build             # Build workspace packages
pnpm test              # Run all unit tests
pnpm test:browser      # Run phase browser tests in Chromium, Firefox, and WebKit
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
- `skill:build` and `skill:package` run on pre-commit whenever `skills/phase/` or `packages/skill/` changes. Lefthook re-stages `packages/skill/scanner/fix-sections.gen.ts`, `metadata.json`, `scripts/scan.mjs`, the generated audit regions, and the zip.
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

The core library, each binding, the command package, and the skill are versioned independently:

- Bump the changed package manifest in `packages/core/` or `packages/react/` for shipped source, build output, or consumer-facing package metadata. A change to `@usephase/core/internal` requires a core minor bump under ADR 0018.
- Bump `packages/cli/package.json` for changes to the command's behavior, build output, or consumer-facing package metadata. The scanner version recorded in output and baselines follows `skills/phase/SKILL.md`, not this package version.
- Do not bump a package for skill-only, test-only, workflow-only, or root README changes. Package README changes reach npm with that package's next release; use an intentional patch only when an npm-facing correction must ship immediately.
- Bump the version in `skills/phase/SKILL.md` whenever installable skill content changes.
- The release workflow validates every merge to `main`, but publishes only package versions not already on npm. An existing version is a successful no-op.

When asked to bump a library package version:

1. Bump `version` in the changed package manifest.
2. Bump `version` in `skills/phase/SKILL.md` when the package change alters the public API or skill references.
3. Prepend a section to that package's `CHANGELOG.md`. Keep all older entries.
4. Use the existing `## X.Y.Z` and `### Patch Changes` / `### Minor Changes` / `### Major Changes` format.
5. Keep each entry to what changed and never overwrite older changelog entries.

When asked to bump the command package version:

1. Bump `version` in `packages/cli/package.json`.
2. Prepend a section to `packages/cli/CHANGELOG.md` using the same heading format.
3. Bump `skills/phase/SKILL.md` only when scanner behavior or installable skill content changes.

Package and skill naming follows [`ADR 0014`](./docs/adr/0014-name-the-tool-phase-and-publish-libraries-under-usephase.md): `phase` names the tool; library packages use the `@usephase` scope, and the `"private"` flag states publication intent.
