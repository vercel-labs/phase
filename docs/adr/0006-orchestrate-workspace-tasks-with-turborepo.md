# Orchestrate workspace tasks with Turborepo

## Status

Partially superseded by [ADR 0008](./0008-enforce-the-skill-distribution-boundary.md). Committed-file generators remain uncached, but the private skill package now owns their Turbo tasks.

## Context

The pnpm workspace needs one task graph that later packages and applications can join. Recursive pnpm commands run package scripts, but do not describe dependencies between them or reuse successful local work.

## Decision

Use Turborepo over the pnpm workspace for build, typecheck, test, size, and validation tasks. Keep oxlint and oxfmt as direct root commands because they are fast repository-wide sweeps, and keep remote caching disabled until CI duration justifies it. Size Limit continues to read source entry points, so `size` does not depend on `build`.

Repository tasks that regenerate committed files, `skill:build`, `skill:package`, and `goldens`, must never be cached. Their Turbo root tasks always execute, and GitHub Actions keeps the README and skill artifact freshness checks as explicit `git diff --exit-code` assertions against the resulting working tree.

## Reason

The task graph gives package work correct ordering and local reuse before applications are added. Skipping a committed-artifact generator on a cache hit could leave the checkout stale while a later freshness assertion inspects files restored from neither the task nor the cache, so those writers must run every time.

## Consequences

Package build outputs and successful read-only checks may use the local Turbo cache. Repository wrappers register root-only scanner and skill work without adding scripts to the published `phase` package, preserving its packed manifest and files.
