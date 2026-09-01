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

- Large repeated lists (dozens or hundreds of rows) where each row has meaningful DOM cost. Use `as="li"` or `as="tr"` to match the list structure.
- Heavy DOM subtrees below the fold (complex nested layouts, large tables, rich text).
- Long-form content pages (articles, docs, feeds) where most sections are off-screen.
- You want to keep server-rendered HTML (SEO, deep links) while skipping render cost.

## When to skip it

`Defer` is not a blanket "wrap everything." Paint containment has constraints. Skip it when:

- The content has intentional overflow (box shadows, negative margins, tooltips, popover triggers, decorative bleeds that extend beyond the element boundary).
- The subtree is small or cheap to paint. A few simple elements do not benefit from `content-visibility`, and the containment constraints add complexity without meaningful savings.
- The element is above the fold or in the initial viewport. There is nothing to defer.
- Users rely on find-in-page (Cmd+F) to locate text in this content (Safari does not reliably search inside skipped subtrees).
- The content contains focusable elements that assistive technology needs to reach while off-screen.

The right default: include `Defer` where the rendering cost is real (large lists, complex trees), skip it where the containment constraints cause problems or the content is too simple to benefit.

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
- **Don't place overflowing content inside a `Defer`.** `content-visibility: auto` applies paint containment (per the CSS Containment spec), which clips all overflow to the element's padding edge. Box shadows, negative margins, tooltips, dropdowns, and any decorative bleed that extends outside the `Defer` boundary will be cut off. `overflow: visible` has no effect because paint containment overrides it. Move overflowing elements outside the `Defer`, or remove `Defer` from that container.
- **Don't rely on `useSize` or `useContainerQuery` inside a skipped subtree.** Per the CSS Containment spec, `ResizeObserver` callbacks pause for elements inside skipped `content-visibility: auto` subtrees. Size observations resume automatically when the element scrolls back into view, but any size changes that occurred while skipped are only delivered at that point. If you need to react to the skip/unskip transition itself, use `useRenderState`.
- **Don't mutate layout or unmount based on skip state.** Skip state reports browser rendering, not application presence. Unmounting from it changes layout and rendering semantics.

## Safari caveats

- **Find-in-page (Cmd+F) may not find text inside skipped subtrees.** Safari's native search does not consistently scan content hidden by `content-visibility: auto`. Chrome and Firefox handle this correctly. If search is critical, disable `Defer` for that content or implement application-level search.
- **SVG `<text>` elements** inside a `Defer` may fail to paint in older Safari versions. This was fixed in WebKit (late 2024) but may not have shipped to all Safari releases.

## Does this affect layout or CLS?

It can before the first render. `contain-intrinsic-size: auto <estimatedHeight>` uses the estimate as the subtree's layout placeholder while content is skipped. When the browser renders and measures the content, an inaccurate estimate can change document size and scroll position. Keep the estimate close to the final height. After the first render, the browser remembers the measured size. `Defer` preserves DOM presence and server HTML; it does not defer hydration or guarantee exact initial geometry.

## Reduced motion

Not applicable. `Defer` does not animate. It only toggles the browser's rendering of its subtree.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `Defer` with the other rendering helpers
- [when-visible](./when-visible.md). Gate mounting on viewport entry
- [when-idle](./when-idle.md). Schedule mounting through an idle callback or next-task fallback
- [use-render-state](./use-render-state.md). React to a `Defer` subtree's render-skip state
