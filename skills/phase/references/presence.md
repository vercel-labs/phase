# `Presence`

Renders a `div` that manages its own mount/unmount lifecycle, stamping `data-phase` for exit and `data-enter="animate"` for enter.

## Signature

```tsx
import { Presence } from 'phase/react';

<Presence show={isOpen} className="...">
  content
</Presence>;
```

### Props

| Prop            | Type                     | Default     | Description                       |
| --------------- | ------------------------ | ----------- | --------------------------------- |
| `show`          | `boolean`                | required    | Visibility toggle                 |
| `mode`          | `'mount' \| 'reveal'`    | `'mount'`   | Unmount after exit or stay in DOM |
| `enter`         | `'animate' \| 'instant'` | `'animate'` | First-mount animation behavior    |
| `exitDuration`  | `number`                 | `5000`      | Safety timeout for exit (ms)      |
| `reducedMotion` | `'respect' \| 'ignore'`  | `'respect'` | Reduced motion handling           |
| `ref`           | `Ref<HTMLDivElement>`    | —           | Forward a ref to the wrapper div  |
| ...rest         | `ComponentProps<'div'>`  | —           | All standard div props            |

### Data attributes stamped

| Attribute              | When                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `data-phase="entered"` | Visible                                                        |
| `data-phase="exiting"` | Exit animation in progress                                     |
| `data-enter="animate"` | Enter animation should play (not stamped under reduced motion) |

## When to use

- Simple show/hide transitions where a wrapper `div` is acceptable.
- Modals, toasts, menus, dropdowns — anything that mounts/unmounts.
- You want zero boilerplate (compared to `usePresence`).

## When NOT to use — reach for X instead

| Instead of this               | Use                                           |
| ----------------------------- | --------------------------------------------- |
| Need custom element (not div) | `usePresence` hook — full control over markup |
| Exit→enter between N states   | `<Swap>` — coordinated transitions            |
| Viewport-gated lazy mount     | `<WhenVisible>`                               |
| Per-frame animation           | `useLoop`                                     |

## Do

- Use the canonical CSS pattern:
  ```tsx
  <Presence
    show={isOpen}
    className="transition-opacity data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
  >
    Modal content
  </Presence>
  ```
- Use `mode: 'reveal'` for SEO content (stays in DOM, hidden via data-phase).
- Use `enter: 'instant'` to skip enter animation on first mount (e.g. initially visible content).

## Don't

- **Don't use for per-frame animation** — `Presence` is for mount/unmount transitions only.
- **Don't set `exitDuration` shorter than your CSS transition** — causes mid-animation unmount.
- **Don't nest `<Presence>` inside another `<Presence>` for exit→enter** — use `<Swap>` instead.

## Reduced motion

Default `'respect'`: enter animation skipped (`data-enter="animate"` not stamped), exit is instant (no `exiting` phase). Element still appears/disappears — decoration is removed, not behavior.

## See also

- [usePresence](./use-presence.md) — hook for full control over markup
- [swap](./swap.md) — coordinated exit→enter
- [when-visible](./when-visible.md) — viewport-gated lazy mount
