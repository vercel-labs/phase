# Performance recipes

Patterns for solving common performance problems that surfaced in production audits. Each recipe is a scenario, a minimal pattern, and when to reach for it. For rendering-specific compositions (`Defer` + `WhenVisible` + `lazy()`), see [rendering-recipes.md](./rendering-recipes.md).

## Recipe: sync a class from DOM state without an observer storm

**Scenario:** a theme switcher or third-party library writes a class to `<html>` and several components need to react.

```tsx
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
    visibilityAware: false,
  });

  return theme;
}
```

**Why this works:** `useMutation` coalesces all class mutations into one rAF callback. Observing a single element (not a subtree) and a narrow `attributeFilter` keeps the callback count low. `visibilityAware: false` because `<html>` is always in the DOM.

**What it replaces:** N separate `MutationObserver` instances on `<html>`, each firing synchronously per class change.

## Recipe: custom scrollbar without layout thrash

**Scenario:** a custom scrollbar that needs to sync thumb position with scroll height.

```tsx
function useScrollbarSync(containerRef: RefObject<HTMLElement | null>) {
  const { size } = useSize({ ref: containerRef });

  const thumbHeight = size
    ? (size.height / (containerRef.current?.scrollHeight ?? size.height)) *
      size.height
    : 0;

  return { thumbHeight, trackHeight: size?.height ?? 0 };
}
```

**Why this works:** `useSize` reads dimensions via ResizeObserver (async, compositor-aligned). No `scrollHeight` read inside a MutationObserver callback, no forced reflow.

**What it replaces:** a MutationObserver on `style` + synchronous `scrollHeight`/`clientHeight` reads in the callback.

## Recipe: canvas that truly stops when hidden

**Scenario:** a canvas animation that should stop when its parent is `display:none` (e.g., inside a tab panel).

```tsx
function ParticleCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useCanvas({
    containerRef,
    canvasRef,
    draw: (ctx, frame, size) => {
      ctx.clearRect(0, 0, size.width, size.height);
      drawParticles(ctx, frame, size);
    },
  });

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

**Why this works:** `useCanvas` pauses via `createSight` (IntersectionObserver). When the container's parent is `display:none`, IO reports the element as non-intersecting, and the loop pauses. The shared clock means no desync on resume.

**What it replaces:** a raw `requestAnimationFrame` loop that schedules unconditionally and never checks visibility.

## Recipe: close a panel without wasting resources

**Scenario:** a heavy panel (chat, AI assistant, debug tools) that mounts on every route but is usually closed.

```tsx
function ChatWrapper() {
  const [open, setOpen] = useState(false);

  useWhenIdle(() => void import('./chat-panel'));

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Chat</button>
      <Presence show={open}>
        <Suspense fallback={<Skeleton className="h-[480px]" />}>
          <ChatPanel />
        </Suspense>
      </Presence>
    </>
  );
}

const ChatPanel = lazy(() => import('./chat-panel'));
```

**Why this works:** `Presence` unmounts the panel when closed (no JS, no observers, no subscriptions running). `useWhenIdle` prefetches the chunk during idle so it opens instantly. `Suspense` shows a skeleton while the chunk loads on first open.

**What it replaces:** a heavy panel always mounted with `display:none`, whose JS/observers/subscriptions run on every route.

## Recipe: delete a global `:has()` rule

**Scenario:** a global stylesheet contains `body:has(.modal-open) { overflow: hidden; }`, forcing document-wide has-invalidation on every DOM mutation.

```tsx
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

**Why this works:** direct `style` write on `body` avoids the CSS selector engine. No global `:has()` rule, no has-invalidation on every DOM mutation.

**What it replaces:** `body:has(.modal-open) { overflow: hidden; }` in a global stylesheet that forces the browser to re-evaluate on every class/attribute change across the entire document.

## Recipe: make a long list cheap with `Defer`

**Scenario:** a log viewer, card feed, or data table with hundreds of rows, each with meaningful DOM cost.

```tsx
function LogViewer({ entries }: { entries: LogEntry[] }) {
  return (
    <ul>
      {entries.map((entry) => (
        <Defer as="li" key={entry.id} estimatedHeight="48px">
          <LogRow entry={entry} />
        </Defer>
      ))}
    </ul>
  );
}
```

**Why this works:** `Defer` with `as="li"` applies `content-visibility: auto` to each list item without a wrapper `div`. Off-screen items skip style, layout, and paint. `contain-intrinsic-size: auto 48px` reserves space so the scrollbar stays stable.

**What it replaces:** a long list where every row pays full rendering cost, even when off-screen.

**Caveat:** `content-visibility: auto` skips accessibility tree building for off-screen content, and elements inside a skipped subtree are excluded from find-in-page. For lists with focusable or interactive children, test with assistive technology to confirm the trade-off is acceptable. Prefer `contain-intrinsic-size: auto <estimate>` so the browser remembers real sizes after first paint.

## See also

- [rendering-recipes](./rendering-recipes.md). Composing `Defer` / `WhenIdle` / `WhenVisible` / `useRenderState`
- [audit](./audit.md). The audit procedure that surfaces candidates for these recipes
- [performance](./performance.md). The hot-path performance rules
- [decision-guide](./decision-guide.md). Choosing the right tier before reaching for a recipe
