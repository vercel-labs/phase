# @usephase/core

## 0.6.1

### Patch Changes

- Clarified in the exported `createLifecycle` documentation that it provides an activation signal for consumer-owned loops, while `createLoop` creates and manages the frame loop.

## 0.6.0

### Minor Changes

- Moved the framework-agnostic library from `phase` to `@usephase/core`.
- Exposed easing and math only through `@usephase/core/ease`, and added `@usephase/core/internal` for code shared by `@usephase/*` bindings.
