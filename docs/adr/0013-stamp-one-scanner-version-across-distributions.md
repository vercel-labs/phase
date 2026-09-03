# Stamp one scanner version across distributions

## Context

The scanner ships through an installable skill, an npm command-line package, and a GitHub Action. These distributions release independently, while baseline comparison warns when the recorded version differs from the scanner running the next scan. Stamping each distribution's package version would make a baseline written by the action warn whenever the npm command-line package reads it, even when both contain identical scanner behavior.

## Decision

Every distribution records the current skill version as the scanner version in scan JSON and baselines. npm package versions identify package releases only. Keep the existing `skillVersion` JSON field and `cliVersion` baseline field for compatibility.

## Reason

The recorded version identifies scanner behavior, not its packaging. A shared value keeps outputs and baselines compatible across distributions without changing the versioned schemas.
