# `Defer`

Skips the browser's rendering work (style, layout, paint) for off-screen content via `content-visibility: auto`. Pure CSS — no JS, no observer. Children stay in the DOM and are server-rendered.

## Signature

```tsx
import { Defer } from 'phase/react';

<Defer estimatedHeight="600px" className="...">
  <ArticleSection />
</Defer>;
```

### Props

| Prop              | Type                                   | Default    | Description                                                 |
| ----------------- | -------------------------------------- | ---------- | ----------------------------------------------------------- |
| `estimatedHeight` | `string`                               | `'1000px'` | Reserved size before first paint (any CSS length)           |
| `ref`             | `Ref<HTMLDivElement>`                  | —          | Forward a ref (read render-skip state via `useRenderState`) |
| ...rest           | `Omit<ComponentProps<'div'>, 'style'>` | —          | Standard div props except `style` — use `className`         |

> **No `style` prop.** The render-skip styles (`content-visibility`, `contain-intrinsic-size`) are encapsulated so they can't be accidentally overridden. Style the wrapper with `className`.

## When to use

- Long pages with many off-screen sections (articles, feeds, docs).
- Heavy DOM subtrees that should exist and be crawlable but need not paint until near the viewport.
- You want to keep server-rendered HTML (SEO, deep links) while skipping render cost.

## When NOT to use — reach for X instead

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
- **Keep content that must be in the DOM** (SEO, in-page search, anchor links) — `Defer` SSRs its children.

## Don't

- **Don't expect it to defer hydration or mounting** — React still mounts and hydrates. It defers only the browser's rendering of off-screen content.
- **Don't assume animations inside stop** — paint is skipped but JS keeps running. phase loops self-pause off-screen on their own; gate raw rAF/interval work with `useRenderState`.
- **Don't mutate layout or unmount based on skip state** — that reintroduces the layout shift `contain-intrinsic-size` prevents.

## Does this affect layout or CLS?

No. `contain-intrinsic-size: auto <estimatedHeight>` reserves space before first paint, and the browser remembers the real size afterward. Content keeps its box whether painted or skipped, so nothing shifts on scroll. `Defer` defers rendering only — never layout reservation, DOM presence, or hydration.

## Reduced motion

Not applicable — `Defer` does not animate. It only toggles the browser's rendering of its subtree.

## See also

- [rendering-recipes](./rendering-recipes.md) — composing `Defer` with the other rendering helpers
- [when-visible](./when-visible.md) — gate mounting on viewport entry
- [when-idle](./when-idle.md) — gate mounting on browser idle
- [use-render-state](./use-render-state.md) — react to a `Defer` subtree's render-skip state
