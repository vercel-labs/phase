# Enforce the skill distribution boundary

## Context

The installable `skills/phase/` directory is both a direct-copy contract and the source of the downloadable zip. Scanner tests and evals include deliberate anti-patterns and adversarial payload fixtures. The skills CLI and skills.sh distribute the whole skill directory, not only the zip, so contributor-only fixtures in that tree are shipped product. [PR #52](https://github.com/vercel-labs/phase/pull/52) moved the fixtures out after Snyk reported E005 for a hostile test URL. E005 was expected to clear; W011 third-party content exposure remains the accepted medium residual inherent to a skill that audits outsider-authored code.

## Decision

Keep scanner source, tests, evals, and generation tooling in the private `@usephase/skill` workspace package. Limit `skills/phase/` to `SKILL.md`, `README.md`, `metadata.json`, `references/*.md`, `scripts/scan.mjs`, and `dist/phase-skill.zip`. Make `skill:check` reject every other entry and reject a scanner bundle that imports anything except `node:` built-ins.

## Reason

An enforced allowlist turns distribution safety into a pre-merge invariant instead of a packaging convention. The stable root directory and zip path preserve both consumer installation contracts while the private package can contain adversarial tests safely outside the shipped tree.

## Consequences

Generated artifacts remain committed under `skills/phase/`, but their source and checks are package-owned. New consumer files require an explicit boundary decision and a corresponding guard update.
