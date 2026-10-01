# @usephase/react

## 0.6.6

### Patch Changes

- Re-observe changed elements in `useMutation`, `usePointer`, and `useScroll`, releasing old subscriptions and resetting phase and transient state on restart.

## 0.6.5

### Patch Changes

- Re-observe the current element in `useScrollProgress` after conditional mounts, replacements, and remounts, retaining the last progress while detached.

## 0.6.4

### Patch Changes

- Re-observe changed elements in `useRenderState`, release listeners from detached elements, and reset the phase to `rendered` when observation restarts.

## 0.6.3

### Patch Changes

- Re-observe changed elements in `useSight`, `useLoop`, and `useLifecycle`, releasing old subscriptions and resetting phase state on detach.

## 0.6.2

### Patch Changes

- Re-observe the attached element in `useContainerQuery` after conditional mounts, keyed replacements, and remounts while retaining the last match until the next observation.

## 0.6.1

### Patch Changes

- Clarified in the exported `useLifecycle` documentation that it provides an activation signal for consumer-owned loops, while `useLoop` and `useCanvas` create and manage the frame loop.

## 0.6.0

### Minor Changes

- Moved the React library from `phase/react` to `@usephase/react`.
- Declared `@usephase/core` as the binding's runtime dependency.
