# Declare evidence by name

## Context

Some signals needed information beyond the line they matched. That requirement was spread across true/false fields and unrelated detection code, so changing one signal required coordinated edits whose connection was difficult to see and easy to break.

## Decision

Signals name any extra evidence they need. The analysis module maps each name to its yes/no check, unknown names fail validation, and the detector consults that map instead of containing signal-specific branches. Signals that need direct source logic can still use a custom matching function.

## Reason

The extra requirement is visible beside the signal, while its check stays beside the analysis facts it uses. One shared path applies every named check.

## Consequences

New reusable evidence adds one entry to the registry and its `EvidenceName` type. The detection engine no longer accepts signal-specific flags.

Implemented by [PR #50](https://github.com/vercel-labs/phase/pull/50).
