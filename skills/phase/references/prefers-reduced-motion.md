# `prefersReducedMotion`

Returns `true` when the user has enabled reduced motion at the OS level. Use to gate expensive setup or dynamic imports.

## Signature

```ts
import { prefersReducedMotion } from 'phase';

const reduced: boolean = prefersReducedMotion();
```

No options. Returns `false` on the server (no `matchMedia`).

## When to use

- Gating expensive setup that shouldn't happen under reduced motion:
  ```ts
  if (!prefersReducedMotion()) {
    const { startParticles } = await import('./particles');
    startParticles(canvas);
  }
  ```
- Conditionally importing heavy animation modules.
- Making decisions at app initialization time before any hooks run.

## When not to use

| Instead of this                            | Use                                                             |
| ------------------------------------------ | --------------------------------------------------------------- |
| Reactive subscription to motion preference | `usePrefersReducedMotion()` (re-renders on change)              |
| Gating an animation loop                   | `createLoop` / `useLoop` (handles reduced motion automatically) |
| Checking inside a React component          | The hooks handle it for you (no manual check needed)            |

## Do

- Use for conditional `import()` of heavy animation code.
- Use at module/app init level, outside React's render cycle.
- Trust that all phase hooks/primitives consult this signal automatically. You rarely need this directly.

## Don't

- **Don't poll it in a loop.** It reads from the shared MQL pool (cheap), but still don't call it per-frame.
- **Don't use it to skip reduced motion handling.** That's what `reducedMotion: 'ignore'` is for on the primitive options.
- **Don't assume it's reactive.** This is a point-in-time read. For reactivity, use `useMediaQuery`.

## Reduced motion

This IS the reduced motion primitive. All other phase exports delegate to it internally.

## See also

- [use-prefers-reduced-motion](./use-prefers-reduced-motion.md). Reactive boolean hook
- [use-media-query](./use-media-query.md). Reactive subscription for arbitrary queries
- [create-loop](./create-loop.md). Automatic reduced-motion handling via `reducedMotion` option
- [create-lifecycle](./create-lifecycle.md). Automatic reduced-motion handling
