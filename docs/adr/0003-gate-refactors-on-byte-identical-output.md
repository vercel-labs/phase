# Gate refactors on byte-identical output

## Context

Scanner refactors can accidentally change findings, ranking, excerpts, or serialized output even when their stated purpose is structural. Mixing those changes with detection policy makes regressions difficult to distinguish from intentional behavior.

## Decision

Scanner refactor PRs must preserve the planted-defect text golden byte-for-byte and its JSON value exactly after normalizing the skill-version stamp. Other scenario gates must pass, and fixture workspace content must remain unchanged. Detection changes use the signal workflow with executable examples and recalibration instead of riding a refactor.

## Reason

A frozen output boundary makes each structural change independently reviewable and gives regressions a binary failure signal. Intentional detection changes then carry the evidence and review specific to policy changes.

## Consequences

The JSON comparison normalizes the independently verified skill-version stamp. A refactor that needs different findings or wording is split from the behavior change rather than updating goldens inside the refactor.

Implemented by [PR #44](https://github.com/vercel-labs/phase/pull/44), [PR #46](https://github.com/vercel-labs/phase/pull/46), [PR #47](https://github.com/vercel-labs/phase/pull/47), [PR #48](https://github.com/vercel-labs/phase/pull/48), [PR #49](https://github.com/vercel-labs/phase/pull/49), [PR #50](https://github.com/vercel-labs/phase/pull/50), [PR #51](https://github.com/vercel-labs/phase/pull/51), and [PR #53](https://github.com/vercel-labs/phase/pull/53).
