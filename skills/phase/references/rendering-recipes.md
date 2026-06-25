# Rendering recipes

How to compose `Defer`, `WhenVisible`, `WhenIdle`, `useIdle`, `useWhenIdle`, and `useRenderState` with each other, with `next/dynamic`, and with the rest of phase. Each recipe is a scenario, a minimal pattern, and when to reach for it.

For the single-helper decision (which one at all), see [decision-guide.md](./decision-guide.md). This file is about combining them.

> **Reserve space in the fallback (for `WhenVisible` / `WhenIdle`).** Their children are absent from the DOM until they mount, so a zero-height or mismatched `fallback` (or `loading` placeholder) shifts everything below the moment the real content appears. Render the fallback at the final content's height — a sized skeleton or fixed-height box. This is the most common way these two helpers introduce a loading problem, and every recipe below follows it.
>
> **`Defer` is different — no hard layout shift.** Its children stay in the DOM and the browser measures and paints them at their true size when they scroll in, so a wrong `estimatedHeight` does **not** shift content. It only affects scrollbar proportion and scroll-anchoring math until first render. Give a realistic estimate to keep the scrollbar steady, but an imperfect one is cosmetic, not a CLS bug.

## Choosing between `Defer`, `WhenVisible`, and `WhenIdle`

When more than one could work, decide in this order:

1. **Must the content be in the server HTML?** (SEO, deep links, no-JS) → `Defer`. It is the only one that keeps children server-rendered.
2. **Is the mount itself expensive?** (large subtree, heavy component) → `WhenVisible` (scroll-gated) or `WhenIdle` (idle-gated). `Defer` still mounts and hydrates — it only skips paint.
3. **Trigger: scroll or idle?** Near-viewport relevance → `WhenVisible`. Non-critical, "whenever there's spare time" → `WhenIdle`.

> `Defer` skips paint but still mounts and hydrates. `When*` skip the mount entirely but drop the content from SSR HTML. Pick by what you can afford to lose.

### phase helpers vs `next/dynamic`

They solve different halves of the problem and compose:

- **`next/dynamic` (or React `lazy()`) splits the _bundle_** — the component's JS lands in a separate chunk and can skip SSR (`ssr: false`). But the chunk still downloads as soon as the component mounts.
- **`WhenVisible` / `WhenIdle` gate the _mount_** — nothing renders (and, with `lazy()`/`dynamic` inside, nothing downloads) until the element nears the viewport or the browser is idle.

Use `next/dynamic` alone when the component is below the fold but will almost certainly be needed (split the bytes, mount normally). Wrap it in `WhenVisible`/`WhenIdle` when you also want to defer the _download_ until the user is likely to need it. In Next.js apps, prefer `next/dynamic` over `lazy()` — it integrates with SSR and the loader.

## Recipe: two-tier — `Defer` outside, `WhenVisible` inside

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

**Scenario:** a heavy, below-the-fold widget in a Next.js app — defer both its bytes and its download until the user scrolls near it.

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

## Recipe: `WhenIdle` + `next/dynamic` (non-critical, idle-loaded)

**Scenario:** a non-critical, code-split widget that should load when the main thread is free — not gated on scroll.

```tsx
const Secondary = dynamic(
  () => import('./secondary-panel').then((m) => m.SecondaryPanel),
  { ssr: false, loading: () => <Skeleton className="h-[320px]" /> },
);

<WhenIdle fallback={<Skeleton className="h-[320px]" />}>
  <Secondary />
</WhenIdle>;
```

**Why/when:** `WhenIdle` defers the mount past first paint; `next/dynamic` keeps the code out of the initial bundle. Both placeholders reserve the same `320px` height to avoid layout shift. Use for supplementary UI (activity feeds, recommendations) that is not SEO-critical. For viewport relevance instead of idle, swap `WhenIdle` for `WhenVisible`. (Outside Next.js, use React `lazy()` + `Suspense` in place of `next/dynamic`.)

## Recipe: `useIdle` to sequence work

**Scenario:** render critical UI immediately, then attach non-critical work once idle.

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

**Why/when:** `useIdle` is the boolean form — reach for it to gate part of a _render_ inline. Prefer `WhenIdle` when wrapping children, `useIdle` for an inline boolean, and `useWhenIdle` for a _side effect_ (next recipe).

## Recipe: prefetch a heavy chunk on idle with `useWhenIdle`

**Scenario:** a panel or route the user will likely open soon — warm its code-split chunk during idle so it opens instantly, without blocking first paint.

```tsx
const openPanel = () => import('./chat-panel-with-chat');
const ChatPanel = lazy(openPanel);

function Chat() {
  useWhenIdle(() => void openPanel()); // prefetch the chunk when idle
  return open ? (
    <Suspense fallback={<Skeleton className="h-[480px]" />}>
      <ChatPanel />
    </Suspense>
  ) : null;
}
```

**Why/when:** `useWhenIdle` is the effect-shaped idle primitive — it runs a callback once, cancels on unmount, and always calls the latest closure. Use it for prefetch, cache warming, or any non-urgent `import()`. It replaces the common (and frequently leaky) hand-rolled `useEffect(() => { const id = requestIdleCallback(...); return () => cancelIdleCallback(id); }, [])` — `useWhenIdle` handles the cancel and the SSR guard for you. Reach for `useIdle` instead when you need to _render_ from the idle signal rather than run a side effect.

## Recipe: render helper around a phase loop

**Scenario:** a `useLoop`/`useCanvas` animation that lives below the fold.

```tsx
<WhenVisible rootMargin="200px">
  <ParticleCanvas /> {/* uses useCanvas internally */}
</WhenVisible>
```

**Why/when:** safe and recommended. phase loops self-pause off-screen via their own `createSight`, so wrapping them is purely about deferring the _mount_ cost, not pausing the loop. You do not need `useRenderState` here — the loop already stops when unseen.

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

**Why/when:** `content-visibility: auto` skips paint, not JavaScript — raw loops keep burning CPU inside a `Defer`. `useRenderState` reports the browser's actual render-skip decision so you can pause them. You only need this for non-phase work; phase loops already self-pause. `useRenderState` only listens — it never mutates layout, so the no-layout-shift guarantee holds.

## What not to compose

- **Don't wrap a `Defer` in a `WhenVisible`** — redundant. `WhenVisible` already withholds the mount until near the viewport, so the `content-visibility` skip never applies. Pick one tier.
- **Don't reach for `useRenderState` around a phase loop** — `useLoop`/`useCanvas`/`useLifecycle` self-pause off-screen already. Adding it is dead weight.
- **Don't use `WhenIdle`/`WhenVisible` for SEO-critical content** — their children are absent from SSR HTML. Use `Defer`.
- **Don't ship a zero-height or mismatched fallback** — gating the mount only helps if the placeholder reserves the final size; otherwise you trade a render cost for a layout shift.

## See also

- [decision-guide.md](./decision-guide.md) — choosing a tier and the single-helper decision
- [defer.md](./defer.md) — `content-visibility` wrapper
- [when-idle.md](./when-idle.md) — idle-gated mount + `whenIdle`
- [when-visible.md](./when-visible.md) — viewport-gated mount
- [use-render-state.md](./use-render-state.md) — render-skip signal for raw work
