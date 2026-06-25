# Easing and math (`phase/ease`)

Pure functions. No browser APIs, no side effects, no React. Safe in server components, build scripts, Web Workers, and tests.

## Import

```ts
import { lerp, clamp01, easeOutCubic, remap } from 'phase/ease';
```

Tree-shakeable — unused functions are dead-code-eliminated.

## Easing functions

All take a progress value (0–1) and return a curved progress value (0–1). They don't know about time, pixels, or anything else — they reshape a number.

| Function                            | Character                                               |
| ----------------------------------- | ------------------------------------------------------- |
| `easeOutCubic(progress)`            | Fast start, smooth deceleration                         |
| `easeOutQuart(progress)`            | Sharper deceleration                                    |
| `easeOutBack(progress, overshoot?)` | Overshoots target, snaps back. Default overshoot ≈ 10%. |
| `easeInOutCubic(progress)`          | Symmetric S-curve                                       |
| `linear(progress)`                  | Identity — no easing                                    |

## Math utilities

| Function      | Signature                          | Description                          |
| ------------- | ---------------------------------- | ------------------------------------ |
| `clamp`       | `(value, min, max) → number`       | Constrain to range                   |
| `clamp01`     | `(value) → number`                 | Constrain to 0–1                     |
| `lerp`        | `(start, end, progress) → number`  | Linear interpolation                 |
| `inverseLerp` | `(start, end, value) → number`     | Where is value in range? Returns 0–1 |
| `remap`       | `(options: RemapOptions) → number` | Map from one range to another        |

### RemapOptions

```ts
interface RemapOptions {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  value: number;
}
```

## The canonical pattern

```ts
const progress = clamp01(elapsed / duration); // normalize time to 0–1
const eased = easeOutCubic(progress); // reshape the curve
const value = lerp(startPos, endPos, eased); // map to your range
```

Easing, interpolation, and your value range are three separate concerns. phase keeps them separate so you can mix and match.

## When to use

- Inside `onTick` / `draw` callbacks to compute animated values.
- In server-side code (e.g. generating animation keyframe data at build time).
- When `useTween` is too heavy or you need the raw math.
- Custom easing for `useTween`'s `easing` option.

## When NOT to use — reach for X instead

| Instead of this                                           | Use                                               |
| --------------------------------------------------------- | ------------------------------------------------- |
| Animating a value into React render                       | `useTween` — manages the loop for you             |
| CSS easing                                                | CSS `cubic-bezier()` or `linear()` — no JS needed |
| Complex easing (bounce, elastic with configurable params) | External library or hand-written math             |

## Do

- Use `clamp01` before easing to prevent out-of-range artifacts.
- Pass custom easing to `useTween`:
  ```tsx
  const value = useTween({ target: 100, easing: easeOutBack });
  ```
- Use `remap` to convert between coordinate spaces:
  ```ts
  const screenX = remap({
    inMin: 0,
    inMax: 1,
    outMin: -100,
    outMax: 100,
    value: progress,
  });
  ```

## Don't

- **Don't call `easeOutBack` with extremely large overshoot** — values > 5 can produce extreme over/undershoot. Default 1.70158 is intentional.
- **Don't allocate the `RemapOptions` object inside `onTick`** — pre-allocate and mutate the `value` field.
- **Don't use easing as a substitute for spring physics** — easing is time-based (fixed duration). Springs are velocity-aware (no fixed duration).

## Reduced motion

Easing functions are pure math — they don't know about reduced motion. The consumer of the eased value is responsible for checking motion preferences (or using a phase primitive that checks automatically).

## See also

- [useTween](./use-tween.md) — single-value animation using these easing functions
- [useLoop](./use-loop.md) — per-frame loop where you'd use lerp/clamp01/easing manually
- [decision-guide](./decision-guide.md) — when CSS easing is sufficient vs. JS
