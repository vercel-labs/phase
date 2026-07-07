# `Swap`

Coordinated exit-then-enter transitions for N states. The current state fully exits before the new state enters (no overlap, no z-index issues).

## Signature

```tsx
import { Swap } from 'phase/react';

<Swap active={currentId}>
  <Swap.State id="a" className="...">
    Content A
  </Swap.State>
  <Swap.State id="b" className="...">
    Content B
  </Swap.State>
</Swap>;
```

### Swap props

| Prop           | Type                    | Default  | Description                           |
| -------------- | ----------------------- | -------- | ------------------------------------- |
| `active`       | `string`                | required | ID of the currently active state      |
| `exitDuration` | `number`                | `5000`   | Safety timeout for exit (ms)          |
| ...rest        | `ComponentProps<'div'>` | —        | All standard div props on the wrapper |

### Swap.State props

| Prop    | Type                    | Default  | Description             |
| ------- | ----------------------- | -------- | ----------------------- |
| `id`    | `string`                | required | Unique state identifier |
| `ref`   | `Ref<HTMLDivElement>`   | —        | Forward a ref           |
| ...rest | `ComponentProps<'div'>` | —        | All standard div props  |

### Behavior

- First state appears instantly (CLS prevention, no enter animation on initial mount).
- Subsequent states animate via `@starting-style` after the previous state exits.
- Rapid changes (A→B→C during A's exit) skip intermediates and advance to the latest `active`.
- `<Swap.State>` outside `<Swap>` throws `PhaseError` with code `missing_context`.

## When to use

- Form→success transitions, step wizards, tab content switching.
- Anywhere you need coordinated exit→enter without overlap.
- When both old and new content should animate (exit old, then enter new).

## When not to use

| Instead of this                 | Use                                |
| ------------------------------- | ---------------------------------- |
| Show/hide (one thing)           | `<Presence>`                       |
| Overlap transitions (crossfade) | Manual dual `<Presence>` + z-index |
| Route-level page transitions    | View Transitions API               |

## Do

- Use the canonical CSS pattern:
  ```tsx
  <Swap active={success ? 'success' : 'form'}>
    <Swap.State
      id="form"
      className="transition-all data-[phase=exiting]:opacity-0"
    >
      <Form />
    </Swap.State>
    <Swap.State
      id="success"
      className="transition-all data-[enter=animate]:starting:opacity-0 data-[phase=exiting]:opacity-0"
    >
      <SuccessMessage />
    </Swap.State>
  </Swap>
  ```
- Ensure every `<Swap.State>` has a unique `id`.

## Don't

- **Don't use `<Swap.State>` outside `<Swap>`.** Throws `PhaseError` with code `missing_context`.
- **Don't expect overlap.** `Swap` is sequential (exit completes, then enter starts). For crossfade, use two `<Presence>` components.
- **Don't change `id` values dynamically.** IDs are stable identifiers for states.

## Reduced motion

Automatic: enter animation skipped for the incoming state, exit is instant for the outgoing state. Both still swap. Decoration is removed, not behavior.

## See also

- [presence](./presence.md). Show/hide without coordination
- [usePresence](./use-presence.md). Hook for custom presence logic
- [when-visible](./when-visible.md). Viewport-gated (different concern)
