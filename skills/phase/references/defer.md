# `Defer`

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`. Runtime-free: no hooks, no observer, only a styled element. Children stay in the DOM and are server-rendered.

## Signature

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="...">
  <ArticleSection />
</Defer>;

<Defer as="li" estimatedHeight="80px">
  <ListItemContent />
</Defer>;
```

### Props

| Prop              | Type                                         | Default    | Description                                                 |
| ----------------- | -------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `as`              | `ElementType`                                | `'div'`    | HTML element to render (`'li'`, `'tr'`, `'section'`, etc.)  |
| `estimatedHeight` | `string`                                     | `'1000px'` | Reserved size before first paint (any CSS length)           |
| `ref`             | `Ref<HTMLElement>`                           | --         | Forward a ref (read render-skip state via `useRenderState`) |
| ...rest           | `Omit<HTMLAttributes<HTMLElement>, 'style'>` | --         | Standard HTML attributes except `style` (use `className`)   |

> **No `style` prop.** The render-skip styles (`content-visibility`, `contain-intrinsic-size`) are encapsulated so they can't be accidentally overridden. Style the wrapper with `className`.

> **Always requires a wrapper element.** `content-visibility` is a CSS property that applies to an element. `Defer` renders that element for you. Use the `as` prop to pick the tag so it fits your document structure. If you cannot wrap the target (e.g., a third-party component that does not forward refs), apply `content-visibility: auto` and `contain-intrinsic-size: auto <height>` as raw CSS on a parent element instead.

## When to use

- Long pages with many off-screen sections (articles, feeds, docs).
- Heavy DOM subtrees that should exist and be crawlable but need not paint until near the viewport.
- You want to keep server-rendered HTML (SEO, deep links) while skipping render cost.
- Repeated list items where each row has meaningful DOM cost. Use `as="li"` or `as="tr"` to avoid a wrapper `div` inside the list.

## When not to use

| Instead of this                             | Use                                           |
| ------------------------------------------- | --------------------------------------------- |
| Avoid mounting / hydrating a subtree at all | `WhenVisible` (viewport) or `WhenIdle` (idle) |
| Lazy-load a code-split chunk                | `WhenVisible` + `lazy()` + `Suspense`         |
| Pause an animation off-screen               | phase loops self-pause; else `useRenderState` |

## Do

- **Reserve realistic space to avoid scrollbar jank:**
  ```tsx
  <Defer estimatedHeight="50vh">
    <Comments />
  </Defer>
  ```
- **Keep content that must be in the DOM** (SEO, in-page search, anchor links). `Defer` SSRs its children. The whole `phase/react` entry is a client boundary (`'use client'`), but server-component children passed into `Defer` still render on the server and stream through.
- **Use the `as` prop for semantic elements** when a wrapper `div` would break document structure:
  ```tsx
  <ul>
    {items.map((item) => (
      <Defer as="li" key={item.id} estimatedHeight="80px">
        <ItemContent item={item} />
      </Defer>
    ))}
  </ul>
  ```

## Don't

- **Don't expect it to defer hydration or mounting.** React still mounts and hydrates. It defers only the browser's rendering of off-screen content.
- **Don't assume animations inside stop.** Paint is skipped but JS keeps running. phase loops self-pause off-screen on their own; gate raw rAF/interval work with `useRenderState`.
- **Don't rely on `useSize` or `useContainerQuery` inside a skipped subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside skipped `content-visibility: auto` subtrees. Size observations resume automatically when the element scrolls back into view, but any size changes that occurred while skipped are only delivered at that point. If you need to react to the skip/unskip transition itself, use `useRenderState`.
- **Don't mutate layout or unmount based on skip state.** That reintroduces the layout shift `contain-intrinsic-size` prevents.

## Does this affect layout or CLS?

No. `contain-intrinsic-size: auto <estimatedHeight>` reserves space before first paint, and the browser remembers the real size afterward. Content keeps its box whether painted or skipped, so nothing shifts on scroll. `Defer` defers rendering only, never layout reservation, DOM presence, or hydration.

## Reduced motion

Not applicable. `Defer` does not animate. It only toggles the browser's rendering of its subtree.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `Defer` with the other rendering helpers
- [when-visible](./when-visible.md). Gate mounting on viewport entry
- [when-idle](./when-idle.md). Gate mounting on browser idle
- [use-render-state](./use-render-state.md). React to a `Defer` subtree's render-skip state
