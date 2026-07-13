# Timed sequence animations

How to build visibility-aware, multi-step animation sequences (do X, wait, do Y, wait, do Z) with phase. This is the most common marketing animation pattern and the one most likely to be built incorrectly.

## Why `useLifecycle` + `setTimeout` fails

The wrong approach combines `useLifecycle` (for visibility) with `setTimeout`/`setInterval` (for timing):

```tsx
const { ref, isActive } = useLifecycle();
const [step, setStep] = useState(0);

useEffect(() => {
  if (!isActive) return;
  const t1 = setTimeout(() => setStep(1), 500);
  const t2 = setTimeout(() => setStep(2), 1200);
  const t3 = setTimeout(() => setStep(3), 2000);
  return () => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);
  };
}, [isActive]);
```

This fails in three ways:

1. **Timers restart from zero on re-entry.** Scroll away then back — the sequence replays from the beginning instead of resuming where it left off.
2. **Timers don't participate in phase's lifecycle.** If the cleanup races or `isActive` flips rapidly, timers can fire out of order or after unmount.
3. **Each step triggers a React re-render.** `setStep` causes reconciliation for what should be a DOM-only operation.

## The correct pattern: `useLoop` with `frame.elapsed`

Derive which animation step you're in from `frame.elapsed` thresholds. The loop auto-pauses off-screen, `elapsed` freezes during pause, and the sequence resumes exactly where it left off.

The loop doesn't fire until the element enters the viewport, so there's a gap between the browser's first paint and the first `onTick` call. If an element's CSS renders it at full width but the animation starts from zero, the user sees a flash: full width → snap to zero → animate back. Set each element's CSS to its animation start state (e.g., `scaleX(0)`, `opacity: 0`) so the browser paints the pre-animation state from the start:

```tsx
const { ref } = useLoop({
  fps: 2,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;

    const e = frame.elapsed;
    const bar1 = el.querySelector<HTMLElement>('[data-bar="1"]');
    const bar2 = el.querySelector<HTMLElement>('[data-bar="2"]');
    const bar3 = el.querySelector<HTMLElement>('[data-bar="3"]');
    if (!bar1 || !bar2 || !bar3) return;

    bar1.style.transform = `scaleX(${clamp01(e / 500)})`;
    bar2.style.transform = `scaleX(${clamp01((e - 500) / 700)})`;
    bar3.style.transform = `scaleX(${clamp01((e - 1200) / 800)})`;
  },
});

return (
  <div ref={ref}>
    {/* CSS initial state matches animation start (scaleX(0)) */}
    <div data-bar="1" className="origin-left scale-x-0" />
    <div data-bar="2" className="origin-left scale-x-0" />
    <div data-bar="3" className="origin-left scale-x-0" />
  </div>
);
```

### Why this works

- **No flash on first entry.** Elements start at `scaleX(0)` in CSS, matching the animation's start state, so there's no visible snap when the loop fires its first tick.
- **`frame.elapsed` freezes during pause.** Scroll away, come back — the sequence picks up exactly where it stopped. No restart on re-entry.
- **`fps: 2` (or `fps: 1`) keeps CPU near zero.** Step transitions happen on second or half-second boundaries. You don't need 60fps to check which step you're in.
- **Zero re-renders.** `onTick` writes to the DOM directly via refs. React never reconciles.
- **Visibility-aware by default.** The loop pauses off-screen and under reduced motion. No manual `IntersectionObserver` needed.

## How to build a timed sequence

1. **Identify the sequence steps.** Each step has a start time (ms from the beginning) and a duration.
2. **Set CSS initial state.** Each animated element should render in its animation start state via CSS (e.g., `scaleX(0)`, `opacity: 0`, `translateY(20px)`). Otherwise, the element flashes at its natural size before the loop's first tick overrides it.
3. **Use `useLoop` with a low `fps`.** `fps: 1` or `fps: 2` is enough for step-based sequences. Use higher FPS only if you need smooth interpolation between steps.
4. **Derive step state from `frame.elapsed` in `onTick`.** Compare against your timing thresholds. Write to DOM directly.
5. **Use `clamp01` for progress within each step.** `clamp01((elapsed - stepStart) / stepDuration)` gives you a 0–1 progress for each step.
6. **Apply easing if needed.** Pipe the clamped progress through an easing function: `easeOutCubic(clamp01((e - start) / duration))`.

## Variations

### Staggered reveal (multiple elements animate in sequence)

Set CSS initial state on each item (`opacity-0` + offset) so nothing flashes before the loop starts:

```tsx
const STAGGER_DELAY = 200;

const { ref } = useLoop({
  fps: 2,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]');
    for (let i = 0; i < items.length; i++) {
      const progress = clamp01((frame.elapsed - i * STAGGER_DELAY) / 600);
      const eased = easeOutCubic(progress);
      items[i].style.opacity = String(eased);
      items[i].style.transform = `translateY(${(1 - eased) * 20}px)`;
    }
  },
});

return (
  <div ref={ref}>
    {items.map((item, i) => (
      <div key={i} data-reveal className="opacity-0 translate-y-5">
        {item}
      </div>
    ))}
  </div>
);
```

### Finite sequence (stop after the last step)

Use `enabled` to stop the loop once the sequence is done:

```tsx
const [done, setDone] = useState(false);

const { ref } = useLoop({
  fps: 2,
  enabled: !done,
  onTick: (frame) => {
    const el = ref.current;
    if (!el) return;

    const bar = el.querySelector<HTMLElement>('[data-bar]');
    if (!bar) return;

    const progress = clamp01(frame.elapsed / 1000);
    bar.style.transform = `scaleX(${easeOutCubic(progress)})`;

    if (progress >= 1) setDone(true);
  },
});

return (
  <div ref={ref}>
    {/* CSS initial state: bar starts at zero width */}
    <div data-bar className="origin-left scale-x-0" />
  </div>
);
```

`setDone(true)` fires once, not per frame. This is a phase transition (one re-render), not a hot-path allocation.

### CSS-only sequences that need lifecycle gating

If the sequence is pure CSS (`@keyframes` with `animation-delay`), use `useLifecycle` to toggle `animation-play-state` instead:

```tsx
const { ref, isActive } = useLifecycle();

return (
  <div ref={ref}>
    <div
      className={cn(
        'motion-safe:[animation-name:reveal-bar]',
        'motion-safe:[animation-fill-mode:forwards]',
        'motion-safe:[animation-delay:0s,0.5s,1.2s]',
        isActive
          ? 'motion-safe:[animation-play-state:running]'
          : 'motion-safe:[animation-play-state:paused]',
      )}
    />
  </div>
);
```

This is the right choice when CSS handles the timing and interpolation and you only need phase for visibility-aware pausing. No `setTimeout`, no JS timing.

## When to use each

| Timing driven by          | Use                                                   |
| ------------------------- | ----------------------------------------------------- |
| JS (`frame.elapsed`)      | `useLoop` with `fps: 1–2` and elapsed-time thresholds |
| CSS (`@keyframes`, delay) | `useLifecycle` toggling `animation-play-state`        |
| Neither (enter/exit only) | `Presence` / `WhenVisible` with CSS transitions       |

## See also

- [use-loop](./use-loop.md). The hook that drives the sequence
- [use-lifecycle](./use-lifecycle.md). For CSS-driven sequences that need visibility gating
- [ease](./ease.md). Easing functions for smooth step transitions
- [decision-guide](./decision-guide.md). Choosing between CSS, phase, and external libraries
- [performance](./performance.md). Rules for `onTick` (zero allocations, no setState)
