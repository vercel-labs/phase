# Animation audit procedure

A repeatable procedure for auditing existing animation and rendering code. A deterministic scanner surfaces anti-pattern candidates; you classify each against the [decision guide](./decision-guide.md) ladder and emit recommendations.

## Contents

- [When to run](#when-to-run)
- [Step 1: Scan for candidates](#step-1-scan-for-candidates)
- [Step 1.5: CSS, loading, and architecture pass](#step-15-css-loading-and-architecture-pass)
- [Step 2: Classify each candidate](#step-2-classify-each-candidate)
- [Step 2.5: Verify the blast radius](#step-25-verify-the-blast-radius)
- [Step 3: Emit recommendations](#step-3-emit-recommendations)
- [Step 4: Verify](#step-4-verify)
- [Scope and handoffs](#scope-and-handoffs)
- [Rules](#rules)
- [When NOT to run the audit](#when-not-to-run-the-audit)
- [Severity weighting](#severity-weighting)
- [Common replacements](#common-replacements)
- [Reviewing phase code](#reviewing-phase-code)
- [Output format](#output-format)

## When to run

- User asks to review, optimize, or audit animation code.
- User reports janky animations, high CPU usage, or excessive re-renders.
- User asks "can this use CSS instead?" or "should I use phase here?"
- User asks to replace an existing animation library with phase.

## Step 1: Scan for candidates

Run exactly this command. The script lives at `scripts/scan.mjs` relative to this skill's directory; resolve it from wherever the skill is installed (e.g. `skills/phase/scripts/scan.mjs` in the phase repo, or `.agents/skills/phase/scripts/scan.mjs` in a consuming project). Do not modify the command beyond the paths:

```bash
node <skill-dir>/scripts/scan.mjs <target-dir>
```

Targets can be directories or individual files, so a scan can cover only changed files:

```bash
git diff --name-only | xargs node <skill-dir>/scripts/scan.mjs
```

| Option                 | Effect                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json`               | Machine-readable output (schemaVersion 1): summary counts plus a flat findings array (`{signal, severity, noise, file, line, text, fix}`), stamped with the skill version that produced it |
| `--fail-on <severity>` | Exit 1 if any finding is at or above `critical`, `high`, or `medium`. For CI gating                                                                                                        |
| `-h`, `--help`         | Usage                                                                                                                                                                                      |

Exit codes: `0` scan completed (the default even when findings exist; the audit is advisory), `1` a `--fail-on` threshold was hit, `2` usage error.

If `scan.mjs` is not available (e.g. the skill is loaded without scripts), perform the scan manually by searching for the signal patterns below in the target codebase.

### Reading the output

Text output groups findings by severity, most severe first. Each block names the signal id, its noise tier, and the fix reference to read before recommending. This sample is this skill's eval-fixture scan; a test asserts it stays identical to the committed golden.

<!-- scan-golden:begin -->

```

## critical

setstate-in-raf — setState/dispatch inside rAF callback (2) · noise: normal
  fix: references/performance.md#never-setstate-inside-ontick--draw
  src/hero-animation.tsx:11  frame = requestAnimationFrame(loop);
  src/hero-animation.tsx:13  frame = requestAnimationFrame(loop);

forced-reflow — Forced reflow (getBoundingClientRect, offsetWidth, etc.) (2) · noise: noisy
  fix: references/performance.md#no-forced-reflows-in-animation-paths
  src/suppressed-banner.ts:6  const width = el.offsetWidth;
  src/ticker.ts:3  const width = el.getBoundingClientRect().width;

missing-reduced-motion — Animation without reduced-motion check (5) · noise: noisy
  fix: references/performance.md#reduced-motion-by-default
  src/hero-animation.tsx:11  frame = requestAnimationFrame(loop);
  src/phases/progress-meter.ts:7  requestAnimationFrame(frame);
  src/suppressed-banner.ts:3  requestAnimationFrame(() => el.classList.add('banner-in'));
  src/ticker.ts:5  requestAnimationFrame(tick);
  styles/globals.css:10  @keyframes float {

## high

manual-raf — Manual requestAnimationFrame loop (4) · noise: noisy
  fix: references/audit.md#common-replacements
  src/phases/progress-meter.ts:7  requestAnimationFrame(frame);
  src/phases/progress-meter.ts:9  requestAnimationFrame(frame);
  src/ticker.ts:5  requestAnimationFrame(tick);
  src/ticker.ts:7  requestAnimationFrame(tick);

global-has-selector — Global :has() selector (broad style invalidation) (1) · noise: precise
  fix: references/performance-recipes.md#recipe-delete-a-global-has-rule
  styles/globals.css:1  body:has(.modal-open) {

non-compositor-animation — Animating a non-compositor property (layout/paint, not transform/opacity) (1) · noise: normal
  fix: references/audit.md#step-15-css-loading-and-architecture-pass
  styles/globals.css:6  transition: all 0.3s ease;

tailwind-transition-all — Tailwind transition-all class (animates layout properties) (1) · noise: noisy
  fix: references/audit.md#step-15-css-loading-and-architecture-pass
  src/card.tsx:5  <div className="rounded-lg border transition-all duration-300 hover:shadow-lg">

## medium

raw-io — Raw IntersectionObserver (not pooled) (1) · noise: normal
  fix: references/performance.md#observer-pooling
  src/lazy-image.tsx:7  const io = new IntersectionObserver(([entry]) => {

js-opacity-transform — JS-driven opacity/transform (may be CSS-only candidate) (1) · noise: noisy
  fix: references/decision-guide.md#tier-1-css-only-no-js
  src/ticker.ts:4  el.style.transform = 'translateX(' + width / 10 + 'px)';

permanent-will-change — Permanent will-change (wastes GPU memory when idle) (1) · noise: normal
  fix: references/performance.md#will-change-only-while-animating
  styles/globals.css:7  will-change: transform;

redundant-mutation-observers — MutationObserver on html/documentElement (coalesce into one useMutation) (1) · noise: normal
  fix: references/performance-recipes.md#recipe-collapse-an-observer-storm-on-html
  src/theme-watcher.ts:2  const observer = new MutationObserver(() => {

## dedup (correct code, optional cleanup)

manual-synced-ref — Manual synced ref (dedup: useSyncedRef offers a shorthand) (1) · noise: precise
  fix: references/use-synced-ref.md
  src/use-latest.ts:4  const valueRef = useRef(value);

─────────────────────────────────────────
Scanned 9 files.
Total: 20 actionable (9 critical, 7 high, 4 medium), 1 dedup, 1 suppressed
Next: classify each candidate against references/audit.md Step 2 (the decision ladder).
Noise tiers: precise = trust it, normal = verify quickly, noisy = verify before recommending.
```

<!-- scan-golden:end -->

Two orthogonal ratings guide how to act on each block:

- **Severity** ranks how bad the issue is when real: `critical` (jank or accessibility failures), `high` (always-on CPU/GPU waste), `medium` (leaks, redundancy, cheaper-tier candidates). `dedup` findings are correct code with a phase shorthand, reported separately and excluded from the actionable count.
- **Noise** ranks how much to trust the detection itself: `precise` means the match is the issue, `normal` means verify quickly, `noisy` means inspect the site before recommending anything.

### Suppressions

A comment `phase-scan-ignore <signal-id> -- <reason>` (colon after `ignore` also accepted) suppresses that signal on the same line and the next line. The reason is mandatory; the scanner warns about and ignores reason-less directives and directives naming unknown signal ids. For per-file signals (`missing-reduced-motion`), a directive anywhere in the file suppresses its single finding. Suppressing a superseding signal (`setstate-in-raf`) re-exposes the general one (`manual-raf`) on that line; name both to silence both. Also note: the scanner cannot tell a dangling directive (nothing left to suppress) from an active one, so remove directives when the code they covered is gone.

**Policy: suppressions record human decisions.** Never add a suppression yourself unless the user has explicitly accepted the finding. If the scanner warns about a reason-less directive, report it; do not silently add a reason or delete the directive.

### Signals

Severity and noise mirror the scanner's catalog; a repo check fails CI when this table drifts from `scan.mjs`. Signals marked **(CSS)** run only on stylesheet files (`.css`/`.scss`/`.sass`/`.less`); **(JSX)** only on `.tsx`/`.jsx`; the rest on all JS/TS files. `missing-reduced-motion` reports once per file.

| Signal                           | Severity | Noise   | Detects                                                                              | Fix reference                                                                                                              |
| -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `setstate-in-raf`                | critical | normal  | State update inside a rAF callback (60 re-renders/sec)                               | [performance.md](./performance.md#never-setstate-inside-ontick--draw)                                                      |
| `forced-reflow`                  | critical | noisy   | Layout read: `getBoundingClientRect`, `offset*`, `scroll*`, `client*`                | [performance.md](./performance.md#no-forced-reflows-in-animation-paths)                                                    |
| `mutationobserver-layout`        | critical | normal  | MutationObserver watching inline styles or reading layout in its callback            | [performance.md](./performance.md#never-drive-layout-from-a-mutationobserver)                                              |
| `missing-reduced-motion`         | critical | noisy   | Animation (rAF, `@keyframes`, `animation:`) with no reduced-motion handling          | [performance.md](./performance.md#reduced-motion-by-default)                                                               |
| `setstate-in-ontick`             | critical | normal  | State update inside a phase `onTick`/`onDraw`/`draw` callback                        | [performance.md](./performance.md#never-setstate-inside-ontick--draw)                                                      |
| `bare-window-listener`           | critical | normal  | resize/scroll listener with a layout read in the handler                             | [performance-recipes.md](./performance-recipes.md#recipe-collapse-n-bare-window-resize-listeners-into-one-pooled-observer) |
| `pointer-listener-layout-read`   | critical | normal  | pointermove/mousemove/touchmove listener with a layout read per event                | [use-pointer.md](./use-pointer.md)                                                                                         |
| `manual-raf`                     | high     | noisy   | Raw rAF loop: no visibility pause, no shared clock, no cleanup                       | [audit.md](#common-replacements)                                                                                           |
| `background-animation`           | high     | noisy   | `setInterval`/`setTimeout` driving transform/opacity work                            | [timed-sequences.md](./timed-sequences.md)                                                                                 |
| `global-has-selector`            | high     | precise | `body:has`/`html:has`/`:root:has`/`*:has` in a stylesheet **(CSS)**                  | [performance-recipes.md](./performance-recipes.md#recipe-delete-a-global-has-rule)                                         |
| `non-compositor-animation`       | high     | normal  | `transition: all`, layout properties, or bare-duration shorthand **(CSS)**           | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `tailwind-transition-all`        | high     | noisy   | `transition-all` utility class **(JSX)**                                             | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `keyframes-layout-animation`     | high     | normal  | Layout property (`width`/`height`/`top`/`left`) inside `@keyframes` **(CSS)**        | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `when-visible-no-fallback`       | high     | noisy   | `WhenVisible`/`WhenIdle` without a sized `fallback` (layout shift) **(JSX)**         | [rendering-recipes.md](./rendering-recipes.md)                                                                             |
| `raw-io`                         | medium   | normal  | `new IntersectionObserver` outside the pool                                          | [performance.md](./performance.md#observer-pooling)                                                                        |
| `raw-ro`                         | medium   | normal  | `new ResizeObserver` outside the pool                                                | [performance.md](./performance.md#observer-pooling)                                                                        |
| `raw-matchmedia`                 | medium   | normal  | `matchMedia(` outside the pool                                                       | [use-media-query.md](./use-media-query.md)                                                                                 |
| `js-opacity-transform`           | medium   | noisy   | `style.opacity`/`style.transform` writes (CSS-only candidate)                        | [decision-guide.md](./decision-guide.md#tier-1-css-only-no-js)                                                             |
| `permanent-will-change`          | medium   | normal  | `will-change` never toggled with animation state **(CSS)**                           | [performance.md](./performance.md#will-change-only-while-animating)                                                        |
| `redundant-mutation-observers`   | medium   | normal  | MutationObserver on `<html>`/`documentElement`                                       | [performance-recipes.md](./performance-recipes.md#recipe-collapse-an-observer-storm-on-html)                               |
| `tailwind-permanent-will-change` | medium   | noisy   | `will-change-transform` class not toggled with state **(JSX)**                       | [performance.md](./performance.md#will-change-only-while-animating)                                                        |
| `reduced-motion-ignored`         | medium   | precise | `reducedMotion: 'ignore'` (bypasses the user preference)                             | [performance.md](./performance.md#reduced-motion-by-default)                                                               |
| `core-primitive-in-component`    | medium   | noisy   | `createLoop`/`createTicker`/`createLifecycle`/`createSight` in a component **(JSX)** | [decision-guide.md](./decision-guide.md#common-mistakes)                                                                   |
| `manual-synced-ref`              | dedup    | precise | `useRef(v)` + unconditional `ref.current = v` (shorthand exists)                     | [use-synced-ref.md](./use-synced-ref.md)                                                                                   |

> Manual heuristics the scanner cannot see: CSS-in-JS (styled-components, vanilla-extract) and non-Tailwind class systems; `getBoundingClientRect()` used only for an initial in-view check; and hand-wired "IO + visibilitychange + reduced motion → boolean" gates. See [Common replacements](#common-replacements).

## Step 1.5: CSS, loading, and architecture pass

Run this alongside the JS scan, before classifying. The scanner automates the CSS/architecture signals marked below; the rest are manual inspection.

### CSS/DOM-scale checks

- **Non-compositor animation** (scanner: `non-compositor-animation` and `keyframes-layout-animation` for CSS, `tailwind-transition-all` for JSX). `transition: all`, a bare-duration shorthand (`transition: 0.3s`), or transitioning/keyframing layout properties (`width`/`height`/`top`/`left`/`margin`) animates off the compositor: layout and paint every frame. Prefer `transform`/`opacity`.
- **Global `:has()` selectors** (scanner: `global-has-selector`). `body:has(...)`, `html:has(...)`, `:root:has(...)`, or `*:has(...)` in a global stylesheet can trigger broad style invalidation; cost scales with the argument selector and subtree size. Scope the rule to a subtree or replace with a data attribute.
- **Missing `content-visibility`** (manual). Large repeated lists (`.map()` returning many items) without `content-visibility: auto` or `Defer` pay full off-screen style/layout cost.
- **Permanent `will-change`** (scanner: `permanent-will-change` for CSS, `tailwind-permanent-will-change` for JSX). `will-change` that is never toggled wastes GPU memory when idle.

### Loading checks (manual)

- **Heavy static imports in always-mounted subtrees.** Top-level imports of heavy packages (markdown renderers, syntax highlighters, animation libraries) in components that mount on every route.
- **`display:none` as a close mechanism.** Components hidden with `display:none`/`visibility:hidden` instead of unmounting keep all JS, observers, and subscriptions running.

### Architecture checks

- **Redundant observers** (scanner: `redundant-mutation-observers`). Multiple `new MutationObserver` calls targeting `<html>`/`document.documentElement`, each firing on class changes; coalesce into one `useMutation`.
- **Bare window listeners with layout reads** (scanner: `bare-window-listener`). Components attaching `addEventListener('resize'|'scroll', ...)` with `getBoundingClientRect`/`offset*` reads in the handler. Replace size reads with pooled `useSize`/`useMediaQuery`, and scroll-position reads (`scrollLeft`/`scrollWidth`) with `useScroll`.
- **Pointer handlers reading layout** (scanner: `pointer-listener-layout-read`). `pointermove`/`mousemove`/`touchmove` handlers calling `getBoundingClientRect` or reading `offset*` force a reflow per event, and move events fire far above frame rate. Replace with `usePointer` (one rAF-batched read per frame).
- **Raw `matchMedia` subscriptions** (scanner: `raw-matchmedia`). Hand-rolled MediaQueryList listeners duplicate what the pooled `useMediaQuery`/`usePrefersReducedMotion` provide.

### Classification ladders

In addition to the animation ladder (`CSS → useTween → phase → external library`), classify loading and containment candidates:

**Loading ladder** (prefer the cheapest tier):

```
Static import  →  next/dynamic  →  WhenVisible + dynamic  →  useWhenIdle prefetch
```

**Containment ladder** (prefer the cheapest tier):

```
CSS content-visibility  →  Defer  →  WhenVisible / WhenIdle  →  conditional unmount
```

## Step 2: Classify each candidate

For each candidate site, determine the best tier from the ladder:

```
CSS-only  →  Minimal JS (useTween)  →  phase primitives  →  External library  →  No change
```

### Classification questions

1. **Can CSS do this alone?** (state toggle, pseudo-class, enter/exit via `@starting-style`, simple transform/opacity)
   → Recommend CSS-only. Remove the JS.

2. **Is it a single numeric value into React render?** (counter, progress bar, opacity from data)
   → Recommend `useTween`.

3. **Does it need per-frame JS, visibility pausing, or lifecycle awareness?**
   → Recommend phase (`useLoop`, `useCanvas`, `useLifecycle`, `Presence`, `Swap`, `WhenVisible`).

4. **Does it need springs, gestures, or keyframe orchestration?**
   → Recommend keeping/adding an external library. Optionally wrap with `useLifecycle` for visibility management.

5. **Is the current implementation already optimal?**
   → Recommend no change. Document why.

## Step 2.5: Verify the blast radius

A recommendation made from a matched line alone is a guess. Perf recommendations have broken SSR, SEO, and Next.js PPR when the auditor did not see the surrounding code. Complete this checklist for every candidate before emitting:

- [ ] **Read the whole file**, not just the finding's line. If the change alters behavior beyond the file, find the component's usage sites (grep the import).
- [ ] **Determine the rendering environment.** In Next.js App Router: is this a Server Component (no `'use client'`)? Is PPR active (`experimental_ppr` in the route, `ppr`/`cacheComponents` in `next.config`)? Is the subtree inside a Suspense boundary or streamed? Is this content in the initial SSR HTML today?
- [ ] **Classify the recommendation's semantics:**
  - **Preserving.** Rendered output and rendering guarantees unchanged: swapping transitioned properties, pooling an observer, moving per-frame `setState` to ref writes, adding reduced-motion handling, `Defer` (children stay server-rendered; only paint is deferred).
  - **Changing.** SSR HTML, hydration timing, mount timing, or visible behavior changes: `WhenVisible`/`WhenIdle` remove children from server HTML; `next/dynamic` with `ssr: false` does too; conditional unmount drops DOM; `useTween` changes when a value arrives.
- [ ] **Semantics-changing recommendations say so and get consent.** State exactly what changes ("this section leaves the server HTML: SEO, LCP, and the PPR static shell are affected") and require the user's explicit go-ahead before applying. Prefer the semantics-preserving alternative when one exists.

Hard rules:

- **Never replace server-rendered content with a client-gated mount** (`WhenVisible`, `WhenIdle`, `next/dynamic` + `ssr: false`) in a Server Component subtree or a PPR static shell without flagging the change and getting confirmation. `Defer` is the SSR-safe default.
- **Framework guarantees trump micro-optimizations.** If a perf recommendation conflicts with framework behavior (streaming, caching, hydration order), the framework wins: find the preserving alternative or recommend no change.

## Step 3: Emit recommendations

For each finding, emit a structured recommendation:

````
### [file:line] — <brief description>

**Current pattern:** <what's there now, 1-2 lines>
**Problem:** <what's wrong and why it matters>
**Recommendation:** <CSS-only | useTween | useLoop | useCanvas | useLifecycle | Presence | Swap | WhenVisible | external library | no change>
**Why this tier:** <one sentence justifying the choice>
**Semantics:** <preserving | changing: what changes (SSR HTML, hydration, timing) and that it needs the user's confirmation>

Before:
```tsx
// existing code (minimal, just the relevant part)
```

After:
```tsx
// recommended replacement
```
````

## Step 4: Verify

After applying fixes, re-run the same scan command. The audit is done when one of these holds for every finding:

- The scan reports zero candidates, or
- every remaining finding is explicitly classified "no change" in your report, or suppressed by a directive the user approved.

If new signals appear (a fix can introduce a different anti-pattern), classify and fix those too. When the work is performance-motivated, measure frame time before and after; an audit without measurement is speculation.

## Scope and handoffs

phase audits what its references can defend: animation lifecycle, rendering gating, observer/listener hygiene, and CSS animation cost. It does **not** audit React data flow, Next.js data fetching (request waterfalls), bundle architecture, caching strategy, or server-component boundaries. A recommendation this skill cannot back with one of its reference files is not a phase recommendation.

While reading context (Step 2.5) you will see adjacent issues. The protocol:

- **Do not fix them under this skill, and do not silently drop them.**
- Append an **Out of scope** section to the report listing each one (one line: file, issue, domain).
- Point to the right skill for the domain: React and Next.js performance (waterfalls, bundle size, server-side performance, re-render architecture) belongs to `react-best-practices` from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`npx skills add vercel-labs/agent-skills`). If that skill is already installed in the project, offer to run it on the flagged files.
- The same boundary applies in reverse: when another skill's guidance conflicts with a phase micro-optimization, defer to the more framework-aware guidance and say so.

## Rules

- **Never recommend a higher tier than needed.** CSS-only is always preferred when it works.
- **Never recommend phase where CSS suffices.** If `transition: opacity 300ms` does the job, say so.
- **Never recommend an external library where phase suffices.** If it doesn't need springs or gestures, phase is enough.
- **"No change" is a valid recommendation.** If the code is already optimal, say so and move on.
- **Always address reduced motion.** If the candidate has no reduced-motion handling, the recommendation must include it.
- **Always address cleanup.** If the candidate leaks listeners/observers/rAF handles, the recommendation must include proper teardown.
- **Show before/after code.** Keep snippets minimal, only the relevant change, not the entire file.
- **Never trade rendering semantics for performance silently.** Changes to SSR HTML presence, hydration, or streaming are semantics-changing (Step 2.5): label them and get explicit consent.
- **Out-of-domain findings are handed off, not improvised.** See [Scope and handoffs](#scope-and-handoffs).

## When NOT to run the audit

Skip the scan when the codebase:

- Uses only CSS transitions/animations with no JS animation code
- Has no raw observer usage (no `new IntersectionObserver/ResizeObserver/MutationObserver`)
- Has already been audited and the scanner confirms zero candidates

## Severity weighting

The scanner encodes this ranking; text output is already grouped by it. When the scan returns many candidates, work top-down:

1. **Critical.** Forced reflows in hot paths (observer callbacks, event handlers, rAF), per-frame `setState`, and missing reduced-motion handling cause visible jank or accessibility failures. Fix first.
2. **High.** Always-on background work (rAF without visibility pausing, timers animating off-screen, global `:has()` invalidation) wastes CPU and battery. Fix second.
3. **Medium.** Redundant observers, missing pooling, and cheaper-tier candidates leak resources or carry avoidable cost. Fix third.
4. **Dedup.** Correct code with a phase shorthand (manual synced refs). Fix last or never.

## Common replacements

| Current pattern                                                      | Replace with                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | `useLoop` (if DOM) or `useCanvas` (if canvas)                                                                                                                                                         |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same, plus the cleanup is now automatic                                                                                                                                                               |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                                                                                                                                                          |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                                                                                                                                                                   |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                                                                                                                                                             |
| Raw `MutationObserver` with reflow reads in callback                 | `useMutation` (rAF-batched, visibility-aware)                                                                                                                                                         |
| `MutationObserver` on `style`/`attributes` to track size or position | `useSize` (ResizeObserver) / `useSight` (IO); reserve MO for `childList`                                                                                                                              |
| Multiple `MutationObserver` on `<html>` for class changes            | Single `useMutation` with coalesced callback                                                                                                                                                          |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)                                                                                                                                           |
| `matchMedia(query)` + change listener                                | `useMediaQuery` (pooled MQL, reactive)                                                                                                                                                                |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                                                                                                                                                            |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                                                                                                                                                       |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                                                                                                                                                          |
| `getBoundingClientRect()` in a `pointermove` handler                 | `usePointer` (one rAF-batched `getBoundingClientRect` per frame, not per event)                                                                                                                       |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                                                                                                                                                         |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                                                                                                                                                           |
| CSS-only animation that's working fine                               | No change. Don't add JS where it's not needed.                                                                                                                                                        |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` (single hook, same signals, pooled IO)                                                                                                                                                 |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`                                                                                                                                               |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops                                                                                                                                          |
| Tailwind `transition-all`                                            | Name the transitioned properties: `transition-colors`, `transition-transform`, `transition-[color,box-shadow]`                                                                                        |
| `setTimeout`/`setInterval` for timed animation sequences             | `useLoop` with `fps: 1–2` and `frame.elapsed`-based steps (see [timed-sequences.md](./timed-sequences.md)); or CSS `@keyframes` + `useLifecycle` toggling `animation-play-state` if purely CSS-driven |
| `useRef(v)` + unconditional `ref.current = v` on every render        | `useSyncedRef(v)` (dedup, the raw pattern is correct, only verbose)                                                                                                                                   |
| Heavy panel always mounted with `display:none`                       | Conditional rendering + `Presence` + `useWhenIdle` prefetch                                                                                                                                           |
| N components with bare `window.addEventListener('resize', ...)`      | `useSize` or `useMediaQuery` (pooled observers, no raw listeners)                                                                                                                                     |
| `scroll` handler reading `scrollWidth`/`clientWidth`                 | `useScroll` (rAF-batched offset + progress; geometry cached, read only on resize, not per event)                                                                                                      |
| Global `body:has(...)` in stylesheet                                 | Scope with a subtree-scoped `<style>` or data-attribute pattern                                                                                                                                       |
| Large list without `content-visibility`                              | `Defer` with `as` prop for semantic elements                                                                                                                                                          |
| `WhenVisible`/`WhenIdle` with no `fallback`                          | Add a `fallback` sized to the final content height (prevents CLS)                                                                                                                                     |
| `@keyframes` animating `height`/`width`/`top`/`left`                 | Keyframe `transform`/`opacity`; for expand/collapse use `grid-template-rows` transitions or measure once with `useSize`                                                                               |

## Reviewing phase code

After implementing, migrating, or reviewing animation code that uses phase, ask: **is it using phase to the best of its ability?** Four questions frame the review:

1. **Right tier?** Could CSS handle this alone? Could `useTween` replace a `useLoop` that only animates one value? Is an external library needed (springs, gestures)? The cheapest tier that works wins.
2. **Right primitive?** Within the phase tier, is each primitive the best fit for what it's doing? Read the relevant reference file's "When to use" / "When not to use" tables.
3. **Right options?** Is `fps` set appropriately (e.g., `fps: 1–2` for state-machine transitions, not 60)? Should a hook use transient mode (`onProgress` / `onResize` / `onVisibilityChange`) instead of re-rendering? Is `observe: 'once'` appropriate for one-shot triggers?
4. **Missing phase?** Is there animation or rendering code with no lifecycle management — animations running off-screen, raw observers, missing reduced-motion handling, long pages without `Defer`?

The scanner's phase-usage signals surface candidates for these questions automatically: `setstate-in-ontick` (invariant 2 after adoption), `reduced-motion-ignored` and `core-primitive-in-component` (questions 2 and 3), and `when-visible-no-fallback` (the rendering helpers' one hard rule).

The specific failure modes and correct patterns live in the reference files: [timed-sequences.md](./timed-sequences.md) for the timer anti-pattern and initial-state flash, [performance.md](./performance.md) for hot-path rules, [decision-guide.md](./decision-guide.md) for tier selection and migration mappings.

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical.** Causes jank or accessibility failures
2. **High.** Wastes significant CPU or leaks resources
3. **Medium.** Suboptimal but functional
4. **No change.** Already well-implemented (list briefly for completeness)
5. **Out of scope.** Adjacent issues for other skills (one line each, naming the skill to use)

End with a summary: "Found N candidates, M actionable, K already optimal."
