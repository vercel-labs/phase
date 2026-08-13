# Performance recipes

Fixes for the CSS, loading, and architecture anti-patterns the audit surfaces: the ones that aren't a single-hook swap. Each recipe pairs a `scan.mjs` finding (or a common audit result) with a minimal fix.

For plain "which hook does X" usage, read that export's own reference (e.g. [use-canvas.md](./use-canvas.md), [defer.md](./defer.md)); this file does not restate documented API usage. For rendering compositions (`Defer` + `WhenVisible` + `lazy()` + `useWhenIdle`), see [rendering-recipes.md](./rendering-recipes.md).

## Recipe: collapse an observer storm on `<html>`

**Scenario:** a theme switcher or third-party library writes a class to `<html>` and several components each spin up their own `MutationObserver` to react. Flagged by the scanner's `redundant-mutation-observers` signal.

```tsx
import { useState, useRef } from 'react';
import { useMutation } from 'phase/react';

function useThemeClass() {
  const [theme, setTheme] = useState('light');
  const htmlRef = useRef(document.documentElement);

  useMutation({
    ref: htmlRef,
    mutation: { attributes: true, attributeFilter: ['class'] },
    onMutations: () => {
      const cl = document.documentElement.classList;
      setTheme(cl.contains('dark') ? 'dark' : 'light');
    },
    visibility: 'ignore',
  });

  return theme;
}
```

**Why this works:** one `useMutation` coalesces all class mutations into a single rAF callback, and many components can consume its result through one shared hook. A narrow `attributeFilter` on a single element (not a subtree) keeps the callback count low. `visibility: 'ignore'` because `<html>` is never meaningfully off-screen: the default `'pause'` would add an `IntersectionObserver` + `visibilitychange` subscription that here is pure overhead, and would stop tracking when the tab is backgrounded.

**What it replaces:** N separate `MutationObserver` instances on `<html>`, each firing synchronously per class change.

## Recipe: collapse N bare `window` resize listeners into one pooled observer

**Scenario:** several components each attach a `window` `resize` listener whose handler reads layout (`getBoundingClientRect`, `offsetWidth`) to react to their own size. Flagged by the scanner's `bare-window-listener` signal.

```tsx
import { useSize } from 'phase/react';

function Sidebar() {
  const { ref, size } = useSize<HTMLElement>();
  const collapsed = (size?.width ?? Infinity) < 240;
  return <aside ref={ref} data-collapsed={collapsed || undefined} />;
}
```

**Why this works:** `useSize` reads from the shared per-box `ResizeObserver` pool: async, compositor-aligned, no `getBoundingClientRect`. Twenty content-box components share one observer, while incompatible box options remain independent. A bare `window` resize listener with a layout read forces a synchronous reflow on every resize event, once per component, and fires even when the element's own size did not change.

**What it replaces:** N components each calling `window.addEventListener('resize', ...)` with a `getBoundingClientRect`/`offset*` read in the handler. For viewport-level breakpoints (not element size), use `useMediaQuery` instead. For scroll position (custom scrollbars, carousels), use `useScroll`, not a bare `scroll` listener that reads `scrollWidth`/`clientWidth`.

## Recipe: delete a global `:has()` rule

**Scenario:** a global stylesheet contains `body:has(.modal-open) { overflow: hidden; }`, so the style engine re-checks the `:has()` condition on any DOM/class change that could affect its argument, causing broad, hard-to-scope invalidation. Flagged by the scanner's `global-has-selector` signal.

```tsx
import { useEffect } from 'react';

// No phase primitive needed: the fix is to delete the global rule.
function ModalOverflowGuard({ open }: { open: boolean }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return null;
}
```

**Why this works:** a direct `style` write on `body` bypasses the selector engine entirely, so there is no global `:has()` rule to invalidate against.

**What it replaces:** `body:has(.modal-open) { overflow: hidden; }` in a global stylesheet, whose invalidation set spans the whole document and is re-checked whenever a mutation could affect the argument.

## See also

- [audit](./audit.md). The audit procedure and scanner that surface candidates for these recipes
- [rendering-recipes](./rendering-recipes.md). Composing `Defer` / `WhenIdle` / `WhenVisible` / `useRenderState` (including deferring or unmounting heavy panels)
- [use-scroll](./use-scroll.md). Scroll-position tracking (custom scrollbars, carousels) without a per-event reflow
- [performance](./performance.md). The hot-path performance rules (including `will-change` lifecycle and `content-visibility` for long lists)
- [decision-guide](./decision-guide.md). Choosing the right tier before reaching for a recipe
