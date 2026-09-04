# Ship one scanner through three distributions

## Context

The scanner reaches consumers as the installable skill, the npm command-line package, and the GitHub Action. Each distribution has its own invocation surface: an agent following SKILL.md, `npx phase` in a terminal, and a workflow step in CI. A second analyzer, or detection logic in a wrapper, would let findings and tiers drift between distributions.

## Decision

One scanner produces findings, and a distribution adapts only invocation and packaging. Everything that depends on where the scanner runs lives in the distribution layer: argument parsing, git diff resolution, CI annotations, and exit-code policy belong to the shared command-line entry and the Action wrapper, and detection modules never learn that git or CI exists. The GitHub Action executes the skill's committed consumer artifact instead of bundling a second scanner, and the npm package bundles the same command-line source.

## Reason

A finding means the same thing everywhere, so baselines and goldens stay portable across distributions and a detection fix lands once. Keeping environment awareness out of detection modules keeps the scanner deterministic on identical input, which the byte-identical refactor gate ([ADR 0003](./0003-gate-refactors-on-byte-identical-output.md)) depends on.

Implemented by [PR #78](https://github.com/vercel-labs/phase/pull/78) and [PR #80](https://github.com/vercel-labs/phase/pull/80).
