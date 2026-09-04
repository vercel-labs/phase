# Publish declared packages from a version-delta matrix

## Context

The repository is moving from one published package to three: the tool plus two libraries. The existing release workflow validates every merge to main and publishes the single package when its manifest version is missing from npm. That version-delta model must now answer "what changed?" for several packages per merge, without release branches, tags, or a manual publish step.

## Decision

The release workflow re-validates the merge commit, compares each declared package's manifest version against npm, and publishes only the missing versions through a per-package matrix. An already-published version is a successful no-op.

Publishing authenticates with npm trusted publishing (OIDC), configured per package. Publish steps stay in the top-level release workflow file because npm validates the calling workflow's filename. Only the publish job holds `id-token: write`. A `release` GitHub environment scopes the publishing capability by label; requiring a reviewer on that environment is a settings toggle enabled for risky moments, not a default. The first publish of a new package uses a one-time granular token, because a trusted-publisher configuration requires the package to already exist on npm.

## Reason

The version bump in a merged PR remains the entire release signal, which fits a repository where CI requires package-affecting changes to include a bump. Delta detection makes the workflow idempotent: re-running publishes nothing twice, and a partial failure resumes by re-running. Trusted publishing removes long-lived npm tokens from the repository entirely.

## Considered options

Changesets was rejected: it adds a second versioning workflow whose main benefits, coordinated bumps and changelog automation, the workspace protocol and hand-written changelogs already cover at this package count. Revisit if inter-package coordination outgrows workspace-protocol rewriting or external contributors need changelog automation.
