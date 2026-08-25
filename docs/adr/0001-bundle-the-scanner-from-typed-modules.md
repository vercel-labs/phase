# Bundle the scanner from typed modules

## Context

The scanner needed typed, testable internal seams without changing the installed skill's zero-dependency, single-file command or its relative metadata lookup.

## Decision

Keep scanner source as TypeScript modules under `scanner/`. A pinned tsdown build emits the committed `skills/phase/scripts/scan.mjs` artifact, and CI checks that the artifact is fresh and deterministic. The consumer contract remains one ESM file runnable with `node scan.mjs`, using only `node:` builtins and resolving metadata at `../metadata.json`.

## Reason

Typed source removes hand-maintained declaration drift and permits deep internal seams while preserving the simple installed interface. The repository-root location was chosen because it was independent of both the installed skill layout and a potential workspace package boundary.

## Consequences

The generated scanner is never hand-edited, and build determinism depends on the pinned bundler version. Scanner source is contributor tooling; consumers receive only the generated artifact.

Implemented by [PR #46](https://github.com/vercel-labs/phase/pull/46) and [PR #47](https://github.com/vercel-labs/phase/pull/47).
