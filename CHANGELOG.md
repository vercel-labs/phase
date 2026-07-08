# phase

## 0.0.2

### Patch Changes

- Add transient (zero-re-render) mode to `useSize`, `useScrollProgress`, and `useSight`. Pass a callback (`onResize`, `onProgress`, `onVisibilityChange`) to receive updates imperatively. The reactive state field is omitted from the return type via overloads, so accessing it in transient mode is a compile-time error.
- Add always-current refs (`sizeRef`, `progressRef`, `phaseRef`, `phaseReasonRef`) to all three hooks. Available in both reactive and transient modes.
- Export new types: `SizeCallback`, `ScrollProgressCallback`, `SightCallback`, and reactive/transient result interfaces for each hook.

## 0.0.1

### Patch Changes

- Initial alpha release
