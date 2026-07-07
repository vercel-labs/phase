# `usePresence`

The hook behind `<Presence>`. Composable mount/unmount lifecycle with CSS transitions. Enter via `@starting-style`, exit coordinated by JS waiting for `transitionend`/`animationend`.

## Signature

```ts
import { usePresence } from 'phase/react';

const { phase, phaseReason, mounted, ref, enter } = usePresence(options);
```

### Options

| Option          | Type                     | Default     | Description                       |
| --------------- | ------------------------ | ----------- | --------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                 |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount behavior              |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)      |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion handling           |

### Return

| Property      | Type                         | Description                                                           |
| ------------- | ---------------------------- | --------------------------------------------------------------------- |
| `phase`       | `PresencePhase`              | `'idle' \| 'entered' \| 'exiting' \| 'exited'`                        |
| `phaseReason` | `PresenceReason`             | `'initial' \| 'show' \| 'hide' \| 'animation-end' \| 'interrupted'`   |
| `mounted`     | `boolean`                    | Whether the element should be in the DOM                              |
| `ref`         | `RefObject<Element \| null>` | Attach to the animated element (needed for `transitionend` listening) |
| `enter`       | `'animate' \| 'instant'`     | Whether to stamp `data-enter="animate"` (accounts for reduced motion) |

## When to use

- Custom mount/unmount transitions where you need full control over markup and styling.
- Building your own presence component with custom elements or logic.
- When `<Presence>` component's `div` wrapper doesn't fit your DOM structure.

## When not to use

| Instead of this                       | Use                                       |
| ------------------------------------- | ----------------------------------------- |
| Show/hide with default div            | `<Presence>` component (less boilerplate) |
| Coordinated exit→enter between states | `<Swap>` component                        |
| Viewport-gated lazy mount             | `<WhenVisible>` component                 |

## Do

- Cleanup is automatic. Exit timers and event listeners are cleared on unmount.
- Use the canonical CSS pattern:
  ```tsx
  const { phase, ref, mounted, enter } = usePresence({ show: isOpen });
  if (!mounted) return null;
  return (
    <div
      ref={ref}
      data-phase={phase}
      data-enter={enter === 'animate' ? 'animate' : undefined}
      className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
    />
  );
  ```
- Always attach the `ref`. Needed for `transitionend`/`animationend` listening.
- Use `mode: 'reveal'` for SEO content or IO re-entry (stays in DOM, toggles visibility).

## Don't

- **Don't forget to attach `ref`.** Without it, exit animation has no element to listen on and relies on the safety timeout.
- **Don't set `exitDuration` too low.** If it's shorter than your CSS transition, the element unmounts mid-animation.
- **Don't use `usePresence` for per-frame animation.** It coordinates mount/unmount transitions only. Use `useLoop` for continuous animation.

## Reduced motion

Default `'respect'`: `enter` is `'instant'` (no `data-enter="animate"` stamped), exit is instant (no `exiting` phase, immediate unmount). Decorative animations are skipped. The element still appears and disappears.

## See also

- [presence](./presence.md). Declarative `<Presence>` component wrapping usePresence
- [swap](./swap.md). Coordinated exit→enter for multiple states
- [when-visible](./when-visible.md). Viewport-gated lazy mount
