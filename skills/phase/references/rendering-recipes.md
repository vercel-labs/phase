# Rendering recipes

How to compose `Defer`, `WhenVisible`, `WhenIdle`, `useIdle`, `useWhenIdle`, and `useRenderState` with each other, with `next/dynamic`, and with the rest of phase. Each recipe is a scenario, a minimal pattern, and when to reach for it.

For the single-helper decision (which one at all), see [decision-guide.md](./decision-guide.md). This file is about combining them.

> **Reserve the final in-flow footprint (for `WhenVisible` / `WhenIdle`).** Their children are absent from the DOM until they mount, so mounting shifts later content when it adds unreserved in-flow size. Reserve that footprint through the wrapper, parent layout, `fallback`, or loading placeholder. The correct footprint can be zero when the child renders null, fixed or portaled UI, or otherwise out-of-flow output. Verify the actual before/after geometry rather than treating fallback presence as proof.
>
> **`Defer` preserves DOM and server HTML, not exact initial geometry.** Before first render, `estimatedHeight` is the subtree's layout placeholder. When the browser measures the real content, a poor estimate can change document size and scroll position. Keep the estimate close to the final height; after the first render, the browser remembers the measured size.

## Choosing between `Defer`, `WhenVisible`, and `WhenIdle`

When more than one could work, decide in this order:

1. **Must the content be in the server HTML?** (SEO, deep links, no-JS) → `Defer`. It is the only one that keeps children server-rendered.
2. **Is the mount itself expensive?** (large subtree, heavy component) → `WhenVisible` (scroll-gated) or `WhenIdle` (idle-scheduled with a next-task fallback). `Defer` still mounts and hydrates. It only skips paint.
3. **Trigger: scroll or idle scheduling?** Near-viewport relevance → `WhenVisible`. Non-critical and safe to run on the fallback → `WhenIdle`.

> `Defer` skips paint but still mounts and hydrates. `When*` skip the mount entirely but drop the content from SSR HTML. Pick by what you can afford to lose.

### phase helpers vs `next/dynamic`

They solve different halves of the problem and compose:

- **`next/dynamic` (or React `lazy()`) splits the _bundle_.** The component's JS lands in a separate chunk and can skip SSR (`ssr: false`). But the chunk still downloads as soon as the component mounts.
- **`WhenVisible` / `WhenIdle` gate the _mount_.** Nothing renders (and, with `lazy()`/`dynamic` inside, nothing downloads) until the element nears the viewport or idle scheduling runs. Without `requestIdleCallback`, `WhenIdle` uses a next-task fallback.

Use `next/dynamic` alone when the component is below the fold but will almost certainly be needed (split the bytes, mount normally). Wrap it in `WhenVisible`/`WhenIdle` when you also want to defer the _download_ until it is likely needed. In Next.js apps, prefer `next/dynamic` over `lazy()`. It integrates with SSR and the loader.

## Recipe: two-tier (`Defer` outside, `WhenVisible` inside)

**Scenario:** a long page of sections, most cheap, a few with a heavy interactive island.

```tsx
<Defer estimatedHeight="80vh">
  <section>
    <Prose />
    <WhenVisible rootMargin="200px">
      <HeavyChart />
    </WhenVisible>
  </section>
</Defer>
```

**Why/when:** `Defer` cheaply skips paint/layout for the whole off-screen section (and keeps the prose crawlable), while `WhenVisible` avoids mounting the genuinely expensive island until it is near the viewport. Use when a section is mostly static content with one heavy widget.

## Recipe: `WhenVisible` + `next/dynamic` (defer the download)

**Scenario:** a heavy, below-the-fold widget in a Next.js app. Defer both its bytes and its download until the viewport nears it.

```tsx
const HeavyChart = dynamic(
  () => import('./heavy-chart').then((m) => m.HeavyChart),
  { ssr: false, loading: () => <div className="h-[400px]" /> },
);

<WhenVisible rootMargin="200px" fallback={<div className="h-[400px]" />}>
  <HeavyChart />
</WhenVisible>;
```

**Why/when:** `next/dynamic` splits the chunk; `WhenVisible` holds the mount (and therefore the chunk download) until the element nears the viewport. Both the `loading` placeholder and the `fallback` reserve the final `400px` height, so nothing shifts. Use `next/dynamic` alone if the widget will almost certainly be seen; add `WhenVisible` to also delay the download for content many users never reach.

## Recipe: `WhenIdle` + `next/dynamic` (non-critical, idle-scheduled)

**Scenario:** a non-critical, code-split widget that may load on an idle callback or next-task fallback, without a scroll gate.

```tsx
const Secondary = dynamic(
  () => import('./secondary-panel').then((m) => m.SecondaryPanel),
  { ssr: false, loading: () => <Skeleton className="h-[320px]" /> },
);

<WhenIdle fallback={<Skeleton className="h-[320px]" />}>
  <Secondary />
</WhenIdle>;
```

**Why/when:** `WhenIdle` schedules the mount through `requestIdleCallback` or a next-task fallback; `next/dynamic` keeps the code out of the initial bundle. Both placeholders reserve the same `320px` height to avoid layout shift. Use for supplementary UI (activity feeds, recommendations) that is not SEO-critical and is safe to mount on the fallback. For viewport relevance, use `WhenVisible` instead. (Outside Next.js, use React `lazy()` + `Suspense` in place of `next/dynamic`.)

## Recipe: `useIdle` to sequence work

**Scenario:** render critical UI immediately, then attach non-critical work through idle scheduling.

```tsx
function Dashboard() {
  const idle = useIdle();
  return (
    <>
      <PrimaryMetrics />
      {idle ? <BackgroundCharts /> : null}
    </>
  );
}
```

**Why/when:** `useIdle` is the boolean form. Reach for it to gate part of a _render_ inline. Prefer `WhenIdle` when wrapping children, `useIdle` for an inline boolean, and `useWhenIdle` for a _side effect_ (next recipe).

## Recipe: prefetch a heavy chunk on idle with `useWhenIdle`

**Scenario:** a panel or route that will likely be opened soon. Warm its code-split chunk through idle scheduling when the next-task fallback is also safe.

```tsx
const openPanel = () => import('./chat-panel-with-chat');
const ChatPanel = lazy(openPanel);

function Chat() {
  useWhenIdle(() => void openPanel()); // prefetch through idle scheduling
  return open ? (
    <Suspense fallback={<Skeleton className="h-[480px]" />}>
      <ChatPanel />
    </Suspense>
  ) : null;
}
```

**Why/when:** `useWhenIdle` is the effect-shaped scheduling primitive. It runs a callback once, cancels on unmount, and always calls the latest closure. Use it for prefetch, cache warming, or a non-urgent `import()` that is also safe on the next-task fallback. It replaces the common (and frequently leaky) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])`. `useWhenIdle` handles cancellation, the fallback, and the SSR guard. Reach for `useIdle` instead when the scheduled result belongs in render.

## Recipe: render helper around a phase loop

**Scenario:** a `useLoop`/`useCanvas` animation that lives below the fold.

```tsx
<WhenVisible rootMargin="200px">
  <ParticleCanvas /> {/* uses useCanvas internally */}
</WhenVisible>
```

**Why/when:** safe and recommended. phase loops self-pause off-screen via their own `createSight`, so wrapping them is purely about deferring the _mount_ cost, not pausing the loop. You do not need `useRenderState` here. The loop already stops when unseen.

## Recipe: `Defer` + `useRenderState` for raw loops

**Scenario:** a hand-written `requestAnimationFrame` loop or `setInterval` inside deferred content.

```tsx
function Raw() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useRenderState(ref);

  useEffect(() => {
    if (phase === 'skipped') clock.pause();
    else clock.resume();
  }, [phase]);

  return (
    <Defer ref={ref}>
      <RawCanvasThing />
    </Defer>
  );
}
```

**Why/when:** `content-visibility: auto` skips paint, not JavaScript. Raw loops keep burning CPU inside a `Defer`. `useRenderState` reports the browser's actual render-skip decision so you can pause them. You only need this for non-phase work; phase loops already self-pause. `useRenderState` only listens and never mutates layout. A poor `Defer` estimate can still change initial geometry when the browser measures the real content.

## What not to compose

- **Don't wrap a `Defer` in a `WhenVisible`.** Redundant. `WhenVisible` already withholds the mount until near the viewport, so the `content-visibility` skip never applies. Pick one tier.
- **Don't reach for `useRenderState` around a phase loop.** `useLoop`/`useCanvas`/`useLifecycle` self-pause off-screen already. Adding it is dead weight.
- **Don't use `WhenIdle`/`WhenVisible` for SEO-critical content.** Their children are absent from SSR HTML. Use `Defer`.
- **Don't leave a nonzero final in-flow footprint unreserved.** Match it through the wrapper, parent layout, or fallback. A zero-height fallback is correct when the mounted output also has zero in-flow footprint.
- **Don't rely on `useSize` or `useContainerQuery` inside a skipped `Defer` subtree.** The CSS Containment spec silences `ResizeObserver` callbacks while `content-visibility: auto` content is skipped. This is spec behavior across all browsers, not a bug. Size observations resume when the element scrolls back into view, but any changes that occurred while skipped are delivered only at that point. Use `useRenderState` to detect the skip/unskip transition if your code depends on it.

## See also

- [decision-guide.md](./decision-guide.md). Choosing a tier and the single-helper decision
- [defer.md](./defer.md). `content-visibility` wrapper
- [when-idle.md](./when-idle.md). Idle-scheduled mount with a next-task fallback
- [when-visible.md](./when-visible.md). Viewport-gated mount
- [use-render-state.md](./use-render-state.md). Render-skip signal for raw work
