# phase

## 0.0.2

### Patch Changes

- Skill: document that a `MutationObserver` must never drive layout. Added a performance rule (reading layout in the callback forces a synchronous reflow; observing `attributes`/`style` with `subtree` reflows once per mutation per frame), an audit scanner signal, and guidance to react to size with `useSize` (ResizeObserver) and visibility with `useSight` (IntersectionObserver), reserving `MutationObserver` for structural `childList` changes.

## 0.0.1

### Patch Changes

- Initial alpha release
