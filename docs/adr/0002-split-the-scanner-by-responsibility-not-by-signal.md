# Split the scanner by responsibility, not by signal

## Context

Giving every signal its own file would create many tiny files while leaving the difficult shared code elsewhere. At the decision point, 12 of 27 signals were roughly six-line data entries; shared source analysis, parsing, detection, and output contained the real complexity.

## Decision

Keep signal definitions together as data. Split the scanner by responsibility: shared analysis, source-text parsing, detection, environment discovery, file traversal, output rendering, and command-line handling.

## Reason

Organizing by responsibility gives each shared behavior one clear owner. One-file-per-signal organization would spread related code across more files without making signals safer to change.

## Consequences

New signals normally add one definition and executable examples. Shared behavior changes in the module responsible for it. When a simple pattern is insufficient, a signal can still provide a custom matching function.

Implemented by [PR #47](https://github.com/vercel-labs/phase/pull/47).
