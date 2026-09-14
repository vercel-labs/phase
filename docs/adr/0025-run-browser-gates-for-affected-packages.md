# Run browser gates for affected packages

## Context

ADR 0011 required native browser tests on every pull request. The packed end-to-end consumer later added another three-engine suite spanning the runtime packages, examples, and production harness. Running both suites for changes outside that package graph spends most of the PR validation time without exercising changed behavior, while a workflow-owned path list would duplicate dependency knowledge already owned by Turbo.

## Decision

Model packed end-to-end testing as an uncached Turbo task and declare every workspace package it executes through the package graph. On pull requests, use Turbo's affected plan to decide whether the required browser check provisions browsers and runs `test:browser` and `test:e2e`. A relevant task always executes in real engines rather than replaying a cached result. The browser check still reports success when no runnable task is affected. The release workflow runs the complete browser gate on every push to `main`.

## Reason

Turbo owns workspace dependencies and task ordering, so it can determine relevance without a second list that may drift. Keeping browser tasks uncached preserves production evidence for changed runtime behavior, while the unconditional release gate verifies the merged commit before publication.

Implemented by [PR 91](https://github.com/vercel-labs/phase/pull/91).
