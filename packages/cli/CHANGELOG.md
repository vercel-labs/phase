# phase

## 0.7.0

### Minor Changes

- Added `tailwind-layout-transition` findings for complete Tailwind arbitrary transition lists that include an explicit layout property. Existing baselines do not contain the new signal, so `--fail-on high` can report new failures after upgrading.

## 0.6.1

### Patch Changes

- Lowered missing reduced-motion findings from critical to medium so they remain visible without dominating critical scanner reports.

## 0.6.0

### Minor Changes

- This package now publishes as `phase`: the command-line scanner behind `npx phase scan` and `npx phase explain`. Versions of `phase` below 0.6.0 on npm are the legacy runtime library, which now ships as `@usephase/core` and `@usephase/react`.
- GitHub-format annotations now include an `npx phase explain <signal>` hint alongside the hosted fix link.

## 0.1.0

### Minor Changes

- Added the private `@usephase/cli` command package in preparation for publishing it as `phase`.
