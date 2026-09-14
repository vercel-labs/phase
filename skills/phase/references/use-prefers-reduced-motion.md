# `usePrefersReducedMotion`

Reactive boolean that tracks the user's `prefers-reduced-motion` OS setting. Re-renders only when the preference changes.

## Signature

```ts
import { usePrefersReducedMotion } from '@usephase/react';

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
- Changing the value passed to another hook. For example, use it to skip a `useSight` gate and pass the final value to `useTween` immediately. `useTween` completes to its current `to`, but it does not choose that value.
- Skipping a dynamic `import()` of a heavy animation module:
  ```tsx
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    import('./confetti').then((m) => m.start());
  }, [reduced]);
  ```

## When not to use

| Instead of this                                     | Use                                                  |
| --------------------------------------------------- | ---------------------------------------------------- |
| Completing `useTween` to its current `to`           | Keep the default `reducedMotion: 'complete'`         |
| Gating a phase-owned loop, lifecycle, or transition | Use its automatic reduced-motion behavior            |
| One-shot check outside React (module init)          | `prefersReducedMotion()` (synchronous, non-reactive) |
| Subscribing to an arbitrary CSS media query         | `useMediaQuery(query)`                               |

### APIs that already handle reduced motion

| Behavior                  | APIs                                                                    | Default under reduced motion                       |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Loops and lifecycle       | `createLoop`, `useLoop`, `useCanvas`, `createLifecycle`, `useLifecycle` | Pause, or complete when the API supports that mode |
| Finite numeric tween      | `useTween`                                                              | Jump to the current `to`                           |
| Mount/unmount transitions | `usePresence`, `Presence`, `Swap`                                       | Skip decorative enter and exit motion              |
| Built-in one-shot enter   | `WhenVisible`, `WhenIdle`                                               | Mount content without the built-in enter marker    |

Observation and input APIs such as `useSight`, `useScrollProgress`, `useScroll`, `usePointer`, and `useMutation` keep reporting their values under reduced motion. They cannot know whether a caller will animate with those values. `createTicker` is a raw clock and also has no reduced-motion behavior. Use this hook before custom CSS, WAAPI, raw rAF, or an external animation library, and when reduced motion changes a target or fallback.

## Do

- Use for non-phase animations that need a reactive reduced-motion signal.
- Combine with `useCallback` so event handlers pick up preference changes without re-binding.
- A parent may handle reduced motion for an animated child by not rendering the child while reduced motion is on and showing the same information without motion. See [Reduced motion by default](./performance.md#reduced-motion-by-default) before the child's phase API uses `reducedMotion: 'ignore'`.

## Don't

- **Don't check this inside `onTick` / `draw`.** Lifecycle-aware phase loops already pause under reduced motion. Hooks can't be called outside React components, and checking it per-frame is redundant anyway.
- **Don't duplicate the query string.** This hook exists so you never type `'(prefers-reduced-motion: reduce)'` manually.

## Reduced motion

This is a convenience wrapper around `useMediaQuery('(prefers-reduced-motion: reduce)')`. It uses the shared MQL pool, so multiple callers share one `MediaQueryList`.

## See also

- [prefers-reduced-motion](./prefers-reduced-motion.md). Synchronous one-shot check
- [use-media-query](./use-media-query.md). Arbitrary CSS media query subscription
- [use-loop](./use-loop.md). Automatic reduced-motion handling for animation loops
