# @usephase/codemod

## 0.1.0

### Minor Changes

- Added `migrate-phase-to-usephase` to map legacy `phase` module specifiers and package metadata to `@usephase/core` and `@usephase/react`, with dry runs, source-aware dependency selection, deterministic summaries, and idempotent recovery.
- Replaced the custom argument parser with Commander 15, added a static catalog-to-handler registry, and raised the codemod runner's minimum Node.js version to 22.12.0.
