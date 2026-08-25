# Gate refactors on byte-identical output

## Context

Structural scanner changes can accidentally alter findings, ranking, quoted source, or saved output. Mixing those differences with intentional changes to what the scanner reports makes mistakes difficult to distinguish from planned behavior.

## Decision

For scanner-only refactors, committed text output must remain byte-for-byte identical. Parsed JSON must remain equal after ignoring only the skill version, which changes between releases. All other scenario checks must pass, and fixture source must not change. Intentional changes to findings use the signal workflow with executable examples and recalibration instead of riding a refactor.

## Reason

This separates two review questions: did the structure change safely, and did detection behavior change intentionally? Each PR answers one question, and any unexpected output difference fails an exact check.

## Consequences

Skill-version changes do not fail the JSON check; no other output difference is exempt. A refactor that needs different findings or wording is split from the behavior change instead of updating saved output inside the refactor.

Implemented by [PR #44](https://github.com/vercel-labs/phase/pull/44), [PR #46](https://github.com/vercel-labs/phase/pull/46), [PR #47](https://github.com/vercel-labs/phase/pull/47), [PR #48](https://github.com/vercel-labs/phase/pull/48), [PR #49](https://github.com/vercel-labs/phase/pull/49), [PR #50](https://github.com/vercel-labs/phase/pull/50), [PR #51](https://github.com/vercel-labs/phase/pull/51), and [PR #53](https://github.com/vercel-labs/phase/pull/53).
