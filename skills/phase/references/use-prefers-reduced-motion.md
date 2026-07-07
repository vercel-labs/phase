# `usePrefersReducedMotion`

Reactive boolean that tracks the user's `prefers-reduced-motion` OS setting. Re-renders only when the preference changes.

## Signature

```ts
import { usePrefersReducedMotion } from 'phase/react';

const reduced: boolean = usePrefersReducedMotion();
```

No parameters. Returns `false` during SSR and initial hydration, then the live value.

## When to use

- Gating a non-phase animation (hover effect, burst rAF loop, Lottie) on reduced motion:

  ```tsx
  const reduced = usePrefersReducedMotion();

  const onHover = useCallback(() => {
    if (reduced) return;
    runBurstAnimation(ref.current);
  }, [reduced]);
  ```

- Conditionally rendering a static fallback instead of an animated component:
  ```tsx
  const reduced = usePrefersReducedMotion();
  return reduced ? <StaticHero /> : <AnimatedHero />;
  ```
- Skipping a dynamic `import()` of a heavy animation module:
  ```tsx
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    import('./confetti').then((m) => m.start());
  }, [reduced]);
  ```

## When not to use

| Instead of this                             | Use                                                              |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Gating `useLoop` / `useCanvas` / `Presence` | They handle reduced motion automatically via `reducedMotion` opt |
| One-shot check outside React (module init)  | `prefersReducedMotion()` (synchronous, non-reactive)             |
| Subscribing to an arbitrary CSS media query | `useMediaQuery(query)`                                           |

## Do

- Use for non-phase animations that need a reactive reduced-motion signal.
- Combine with `useCallback` so event handlers pick up preference changes without re-binding.

## Don't

- **Don't check this inside `onTick` / `draw`.** Phase hooks already pause under reduced motion. Hooks can't be called outside React components, and checking it per-frame is redundant anyway.
- **Don't duplicate the query string.** This hook exists so you never type `'(prefers-reduced-motion: reduce)'` manually.

## Reduced motion

This is a convenience wrapper around `useMediaQuery('(prefers-reduced-motion: reduce)')`. It uses the shared MQL pool, so multiple callers share one `MediaQueryList`.

## See also

- [prefers-reduced-motion](./prefers-reduced-motion.md). Synchronous one-shot check
- [use-media-query](./use-media-query.md). Arbitrary CSS media query subscription
- [use-loop](./use-loop.md). Automatic reduced-motion handling for animation loops
