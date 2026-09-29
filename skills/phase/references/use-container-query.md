# `useContainerQuery`

Returns whether an element matches a size-based container breakpoint. Resize updates re-render only when the match result flips. Element changes may add one lifecycle reconciliation render.

## Signature

```ts
import { useContainerQuery } from '@usephase/react';

const { ref, matches } = useContainerQuery<T>(breakpoint, options?);
```

### Breakpoint (first arg)

| Property    | Type     | Description             |
| ----------- | -------- | ----------------------- |
| `minWidth`  | `number` | Minimum width to match  |
| `maxWidth`  | `number` | Maximum width to match  |
| `minHeight` | `number` | Minimum height to match |
| `maxHeight` | `number` | Maximum height to match |

### Options (second arg)

| Option | Type                   | Default  | Description        |
| ------ | ---------------------- | -------- | ------------------ |
| `ref`  | `RefObject<T \| null>` | returned | Bring your own ref |

### Return

| Property  | Type                   | Description                             |
| --------- | ---------------------- | --------------------------------------- |
| `ref`     | `RefObject<T \| null>` | Attach to the measured element          |
| `matches` | `boolean`              | Last observed match (initially `false`) |

The hook observes the element attached to `ref` after commit. It follows the ref across conditional mounts, keyed replacements, and remounts. `matches` stays at its last value while no element is attached, then updates after the new element's first ResizeObserver delivery. On first mount, it remains `false` until that delivery.

## When to use

- Component-level responsive design (independent of viewport).
- Showing/hiding content based on container width.
- Adapting layout at specific size boundaries.

## When not to use

| Instead of this                        | Use                             |
| -------------------------------------- | ------------------------------- |
| Need actual dimensions (not a boolean) | `useSize`                       |
| Viewport-based media query             | `useMediaQuery`                 |
| CSS container queries are sufficient   | CSS `@container` (no JS needed) |

## Do

- Use for responsive component behavior:
  ```tsx
  const { ref, matches: isWide } = useContainerQuery({ minWidth: 600 });
  return <div ref={ref}>{isWide ? <WideLayout /> : <NarrowLayout />}</div>;
  ```
- Combine multiple breakpoints by calling `useContainerQuery` multiple times.

## Don't

- **Don't use when CSS `@container` queries can do the job.** Pure CSS is cheaper.
- **Don't set contradictory min/max values.** `matches` will always be `false`.
- **Don't expect updates inside a skipped `Defer` subtree.** Like `useSize`, this hook uses `ResizeObserver` internally. The CSS Containment spec silences RO callbacks while `content-visibility: auto` content is skipped. Observations resume when the element scrolls back into view.

## Reduced motion

Not applicable. Reports a boolean, not animation.

## See also

- [useSize](./use-size.md). Raw dimensions (re-renders on every change)
- [useMediaQuery](./use-media-query.md). Viewport/device media queries
