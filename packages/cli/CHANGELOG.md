# phase

## 0.7.5

### Patch Changes

- Updated the embedded scanner version to 0.0.63 for the revised `useScrollProgress` guidance.

## 0.7.4

### Patch Changes

- Updated the embedded scanner version to 0.0.62 for the revised `useRenderState` guidance.

## 0.7.3

### Patch Changes

- Updated the embedded scanner version to 0.0.61 for the revised `useSight`, `useLoop`, and `useLifecycle` guidance.

## 0.7.2

### Patch Changes

- Updated the embedded scanner version to 0.0.60 after the skill added a non-blocking version notice and runtime contract checks.

## 0.7.1

### Patch Changes

- Updated the embedded scanner version to 0.0.59 for the revised `useContainerQuery` guidance.

## 0.7.0

### Minor Changes

- Added `tailwind-layout-transition` for static Tailwind `transition-[...]` utilities that name a layout property. Existing baselines do not include this signal, so upgrading may cause `--fail-on high` to fail on new findings.

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
