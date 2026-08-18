# Animation audit procedure

A repeatable procedure for auditing existing animation and rendering code. A deterministic scanner surfaces anti-pattern candidates; you classify each against the [decision guide](./decision-guide.md) ladder and emit recommendations.

## Contents

- [When to run](#when-to-run)
- [Step 0: Establish context](#step-0-establish-context)
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
- User asks to make a page render faster or reduce the cost of off-screen content.
- User asks "can this use CSS instead?" or "should I use phase here?"
- User asks to replace an existing animation library with phase.

## Step 0: Establish context

Recommendations carry obligations that findings do not, and the obligations depend on the environment. Before scanning, know what you are auditing:

- **The framework and rendering model.** Next.js App Router? Server Components? PPR or streaming? The scanner stamps what it detects (see [Reading the output](#reading-the-output)), but its detection is best-effort; confirm from `package.json` and the config when it matters.
- **What is server-rendered today.** Content in the initial SSR HTML is load-bearing for SEO, LCP, and any static shell. Changing that is never "just perf" (see [Step 2.5](#step-25-verify-the-blast-radius)).
- **The entry points.** Skim the main routes/pages the user cares about so findings land in a mental map rather than a vacuum. For a route audit, read directly rendered local or shared components that own animation, chart, canvas, scroll, or rendering behavior. Stop there: do not expand into backend, data, generated, or unrelated workspace dependencies.

This costs a minute and is what separates a recommendation from a guess.

## Step 1: Scan for candidates

Run exactly this command. The script lives at `scripts/scan.mjs` relative to this skill's directory; resolve it from wherever the skill is installed (e.g. `skills/phase/scripts/scan.mjs` in the phase repo, or `.agents/skills/phase/scripts/scan.mjs` in a consuming project). Do not modify the command beyond the paths:

```bash
node <skill-dir>/scripts/scan.mjs <target-dir>
```

Targets can be directories or individual files, so a scan can cover only changed files:

```bash
git diff --name-only --diff-filter=ACMR -z | node <skill-dir>/scripts/scan.mjs --stdin0
```

Scanner targets are literal and non-transitive: scanning a route does not follow its imports. Run the primary route scan first, then scan the smallest focused files or directories for the directly rendered relevant UI dependencies identified in Step 0. Do not turn this into automatic import traversal or a workspace-wide scan.

| Option                 | Effect                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json`               | Machine-readable output (schemaVersion 1): summary counts plus a flat findings array (`{signal, severity, noise, file, line, text, fix}`), stamped with the skill version that produced it |
| `--stdin0`             | Read NUL-delimited targets from stdin. An empty stream scans nothing. Intended for changed-file scans                                                                                      |
| `--fail-on <severity>` | Exit 1 if any finding is at or above `critical`, `high`, or `medium`. For CI gating                                                                                                        |
| `--signal <id>`        | Report only this signal. Repeatable                                                                                                                                                        |
| `--severity <level>`   | Report only this severity. Repeatable                                                                                                                                                      |
| `--noise <tier>`       | Report only this noise tier. Repeatable, so `--noise precise --noise normal` drops the noisy ones                                                                                          |
| `--exclude <path>`     | Skip paths containing this text, or matching it as a glob when it has a wildcard. Repeatable                                                                                               |
| `--limit <n>`          | Cap the `findings` array in `--json` output (`summary.total` still reports the true count)                                                                                                 |
| `-h`, `--help`         | Usage                                                                                                                                                                                      |

Exit codes: `0` scan completed (the default even when findings exist; the audit is advisory), `1` a `--fail-on` threshold was hit, `2` usage error. Requires Node 20 or newer.

**Read the text output, not `--json`.** Text caps each signal's listing at 20 entries; `--json` does not, and on a large Tailwind codebase the full findings array runs to tens of thousands of tokens. When you need the entries a cap hid, scope the request: `--json --signal tailwind-transition-all`, optionally with `--limit`.

If `scan.mjs` is not available (e.g. the skill is loaded without scripts), perform the scan manually by searching for the signal patterns below in the target codebase.

### Reading the output

The report opens with **hotspots**: the files carrying the most candidates. Work is done per file, so a file with seven candidates across four signals is usually one rewrite, and it is where to start. Findings then group by severity, most severe first. Each block names the signal, why it matters, the replacement to reach for, and the reference to read before recommending. This sample is this skill's eval-fixture scan; a test asserts it stays identical to the committed golden.

<!-- scan-golden:begin -->

```

## hotspots (most candidates per file)
    5  src/ticker.ts
       manual-raf ×2, forced-reflow, js-opacity-transform, missing-reduced-motion
    4  styles/globals.css
       global-has-selector, missing-reduced-motion, non-compositor-animation, permanent-will-change
    3  src/hero-animation.tsx
       setstate-in-raf ×2, missing-reduced-motion
    3  src/phases/progress-meter.ts
       manual-raf ×2, missing-reduced-motion

## critical

setstate-in-raf — setState/dispatch inside rAF callback (2, all per-frame) · noise: normal
  why: 60 re-renders/sec: React reconciles on every frame.
  use: useLoop writing to a ref or the DOM; useTween for one value into render
  read: references/performance.md#never-setstate-inside-ontick--draw
  src/hero-animation.tsx:11  frame = requestAnimationFrame(loop);
  src/hero-animation.tsx:13  frame = requestAnimationFrame(loop);

forced-reflow — Forced reflow (getBoundingClientRect, offsetWidth, etc.) (2) · noise: noisy
  why: Synchronous layout; in a hot path it thrashes every frame.
  use: useSize (ResizeObserver, async) or cache the geometry and re-read on resize
  read: references/performance.md#no-forced-reflows-in-animation-paths
  ↑ in a per-frame path:
  src/ticker.ts:3  const width = el.getBoundingClientRect().width;
  · elsewhere:
  src/suppressed-banner.ts:5  const width = el.offsetWidth;

missing-reduced-motion — Animation without reduced-motion check (4) · noise: noisy
  why: Accessibility gap: motion plays for users who asked for none.
  use: a prefers-reduced-motion media query, or a phase hook (handles it automatically)
  read: references/performance.md#reduced-motion-by-default
  ↑ in a per-frame path:
  src/ticker.ts:5  requestAnimationFrame(tick);
  src/hero-animation.tsx:11  frame = requestAnimationFrame(loop);
  src/phases/progress-meter.ts:7  requestAnimationFrame(frame);
  · in a stylesheet:
  styles/globals.css:16  @keyframes float {

## high

manual-raf — Manual requestAnimationFrame loop (4, all per-frame) · noise: noisy
  why: No visibility pausing, no shared clock, no cleanup.
  use: CSS/WAAPI if browser-animatable; otherwise useLoop/useCanvas for lifecycle + cleanup
  read: references/audit.md#common-replacements
  src/ticker.ts:5  requestAnimationFrame(tick);
  src/ticker.ts:7  requestAnimationFrame(tick);
  src/phases/progress-meter.ts:7  requestAnimationFrame(frame);
  src/phases/progress-meter.ts:9  requestAnimationFrame(frame);

global-has-selector — Global :has() selector (broad style invalidation) (1) · noise: precise
  why: Re-checked on any mutation that could affect the argument.
  use: scope the rule to a subtree, or drive it from a data attribute
  read: references/performance-recipes.md#recipe-delete-a-global-has-rule
  styles/globals.css:1  body:has(.modal-open) {

non-compositor-animation — Animating a non-compositor property (layout/paint, not transform/opacity) (1) · noise: normal
  why: Layout + paint every frame, off the compositor.
  use: name the properties and transition transform/opacity
  read: references/audit.md#step-15-css-loading-and-architecture-pass
  styles/globals.css:6  transition: all 0.3s ease;

tailwind-transition-all — Tailwind transition-all class (animates layout properties) (1) · noise: noisy
  why: Transitions whatever changes, including layout, off the compositor.
  use: name the properties: transition-colors, transition-transform
  read: references/audit.md#step-15-css-loading-and-architecture-pass
  src/card.tsx:5  <div className="rounded-lg border transition-all duration-300 hover:shadow-lg">

## medium

raw-io — Raw IntersectionObserver (not pooled) (1, all per-frame) · noise: normal
  why: Unpooled observer instances and manual cleanup leak over time.
  use: useSight or useLifecycle (pooled IntersectionObserver)
  read: references/performance.md#observer-pooling
  src/lazy-image.tsx:7  const io = new IntersectionObserver(([entry]) => {

js-opacity-transform — JS-driven opacity/transform (may be browser-driven) (1, all per-frame) · noise: noisy
  why: May be browser-driven; inspect whether JavaScript must compute live frames.
  use: CSS/WAAPI if browser-animatable; useLoop only for required live per-frame JS
  read: references/decision-guide.md#tier-1-browser-driven-css-or-waapi
  src/ticker.ts:4  el.style.transform = `translateX(${width / 10}px)`;

permanent-will-change — Permanent will-change (wastes GPU memory when idle) (1) · noise: normal
  why: A GPU layer is held even while nothing animates.
  use: toggle will-change with animation state, or drop it
  read: references/performance.md#will-change-only-while-animating
  styles/globals.css:7  will-change: transform;

redundant-mutation-observers — MutationObserver on html/documentElement (coalesce into one useMutation) (1, all per-frame) · noise: normal
  why: N observers on one target each fire per mutation; one suffices.
  use: one useMutation with a coalesced callback
  read: references/performance-recipes.md#recipe-collapse-an-observer-storm-on-html
  src/theme-watcher.ts:2  const observer = new MutationObserver(() => {

## dedup (correct code, optional cleanup)

manual-synced-ref — Manual synced ref (dedup: useSyncedRef offers a shorthand) (1) · noise: precise
  why: Correct React idiom; useSyncedRef is a one-line shorthand.
  use: useSyncedRef(value)
  read: references/use-synced-ref.md
  src/use-latest.ts:4  const valueRef = useRef(value);

─────────────────────────────────────────
Scanned 9 files.
Total: 19 actionable (8 critical, 7 high, 4 medium), 1 dedup.
20 findings on 17 distinct lines; 13 sit in a per-frame path (a frame loop, observer, or move handler runs them) and cost the most.
Next: start with the hotspots above, then classify each candidate against the decision ladder (references/audit.md Step 2). Findings are candidates, not verdicts.
Noise tiers: precise = trust it, normal = verify quickly, noisy = verify before recommending.

Beyond the scan: no pattern here matches an infinite CSS animation nobody gated, a transitionend
listener driving unmount, eagerly mounted below-fold UI, a timer chain sequencing states, a canvas
sized from devicePixelRatio once, or JS still running inside a skipped content-visibility subtree.
Run the manual and opportunity passes (references/audit.md Step 1.5) before concluding an audit.
```

<!-- scan-golden:end -->

Findings are not problems: a recurring rAF loop may report both its kickoff and recursive scheduling sites, and one line can carry two signals, so the summary states findings and distinct lines separately. One-shot rAF callbacks and type-only references are not loop ownership. Count distinct lines when you report progress.

`Scanned N files` counts files the scanner actually analyzed, never files it merely opened, so a clean result cannot cover code that was skipped. When something could not be read — an unreadable directory, a file the process lacks permission for, a generated line past the length limit — the report ends with an `⚠ Incomplete coverage:` line. Treat that as a hole in the audit and say so in your report; `--json` carries the same information in `summary.filesSkipped` and `summary.linesSkipped`.

The scanner also stamps detected **environment context** into the output (a `Context:` line in text, a `context` object in JSON: `framework`, `appRouter`, `ppr`, `clientComponents`, `evidence`). The stamp names the files it was inferred from; check them before trusting it, because in a monorepo an example app can produce a Next.js marker for a repo that is not one. When it reports Next.js, App Router, or PPR, treat that as detected fact and apply [Step 2.5](#step-25-verify-the-blast-radius) before any rendering recommendation. Detection is best-effort, so its absence proves nothing: Step 2.5 applies regardless. In a monorepo, scan the package you are auditing rather than the repo root; a Next.js example app elsewhere in the repo would otherwise stamp the whole scan.

Three orthogonal ratings guide how to act on each block:

- **Severity** ranks how bad the issue is when real: `critical` (jank or accessibility failures), `high` (always-on CPU/GPU waste), `medium` (leaks, redundancy, cheaper-tier candidates). `dedup` findings are correct code with a phase shorthand, reported separately and excluded from the actionable count.
- **Noise** ranks how much to trust the detection itself: `precise` means the match is the issue, `normal` means verify quickly, `noisy` means inspect the site before recommending anything.
- **Execution** ranks what it costs right now. Listings put `↑ in a per-frame path` first: a proven recurring frame callback, observer callback, or move handler runs those lines, so the same layout read that is free near a one-shot rAF stalls every frame there. Severity cannot see this — on one canvas app, 181 of 182 `forced-reflow` candidates were incidental and every one of them ranked critical. Detection combines local rAF callback cycles with a nearby-code heuristic for other drivers, so it only orders the list: a line called indirectly from a loop reads as incidental and is still reported, below the ones that are visibly per-frame.

A triage pass on a large report is usually `--noise precise --noise normal` (drop the tier that needs a site visit) plus `--exclude` for demo or vendored directories. Narrow, then read.

### Suppressions

A comment `phase-scan-ignore <signal-id> -- <reason>` (colon after `ignore` also accepted) suppresses that signal on the same line and the next line. The reason is mandatory; the scanner warns about and ignores reason-less directives and directives naming unknown signal ids. For per-file signals (`missing-reduced-motion`), a directive anywhere in the file suppresses its single finding. Suppressing a superseding signal (`setstate-in-raf`) re-exposes the general one (`manual-raf`) on that line; name both to silence both. Also note: the scanner cannot tell a dangling directive (nothing left to suppress) from an active one, so remove directives when the code they covered is gone.

**Policy: suppressions record human decisions.** Never add a suppression yourself unless the user has explicitly accepted the finding. If the scanner warns about a reason-less directive, report it; do not silently add a reason or delete the directive.

The directive is the only sanctioned way to silence a finding, but it is not the only way a finding can disappear. These are detection limits, not approved exits — reaching for one to clear a report is falsifying the audit:

- `missing-reduced-motion` goes quiet for a whole file that uses `prefers-reduced-motion` or `reducedMotion`; confirm the handling applies to every animation in that file.
- Renaming a file into an excluded path (`__tests__`, `__mocks__`, `.stories.`, `.spec.`, `.test.`) removes it from the scan.
- Lines longer than 1,000 characters are treated as generated and are not scanned.

### Signals

Severity and noise mirror the scanner's catalog; a repo check fails CI when this table drifts from `scan.mjs`. Signals marked **(CSS)** run only on stylesheet files (`.css`/`.scss`/`.sass`/`.less`); **(JSX)** only on `.tsx`/`.jsx`; the rest on all JS/TS files. `missing-reduced-motion` reports once per file.

| Signal                           | Severity | Noise   | Detects                                                                                          | Fix reference                                                                                                              |
| -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `setstate-in-raf`                | critical | normal  | State update inside a recurring rAF callback (60 re-renders/sec)                                 | [performance.md](./performance.md#never-setstate-inside-ontick--draw)                                                      |
| `forced-reflow`                  | critical | noisy   | Layout read: `getBoundingClientRect`, `offset*`, `scroll*`, `client*`                            | [performance.md](./performance.md#no-forced-reflows-in-animation-paths)                                                    |
| `mutationobserver-layout`        | critical | normal  | MutationObserver watching inline styles or reading layout in its callback                        | [performance.md](./performance.md#never-drive-layout-from-a-mutationobserver)                                              |
| `missing-reduced-motion`         | critical | noisy   | Animation (recurring rAF, `@keyframes`, `animation:`) with no reduced-motion handling            | [performance.md](./performance.md#reduced-motion-by-default)                                                               |
| `setstate-in-ontick`             | critical | normal  | State update inside a phase `onTick`/`onDraw`/`draw` callback                                    | [performance.md](./performance.md#never-setstate-inside-ontick--draw)                                                      |
| `bare-window-listener`           | critical | normal  | resize/scroll listener with a layout read in the handler                                         | [performance-recipes.md](./performance-recipes.md#recipe-collapse-n-bare-window-resize-listeners-into-one-pooled-observer) |
| `pointer-listener-layout-read`   | critical | normal  | pointermove/mousemove/touchmove listener with a layout read per event                            | [use-pointer.md](./use-pointer.md)                                                                                         |
| `js-layout-write`                | high     | noisy   | JavaScript write to SVG geometry/transforms or CSS layout properties                             | [performance.md](./performance.md#no-layout-inducing-writes-in-animation-paths)                                            |
| `manual-raf`                     | high     | noisy   | Proven raw rAF callback cycle: no visibility pause, shared clock, or cleanup                     | [audit.md](#common-replacements)                                                                                           |
| `background-animation`           | high     | noisy   | `setInterval`/`setTimeout` driving transform/opacity work                                        | [timed-sequences.md](./timed-sequences.md)                                                                                 |
| `global-has-selector`            | high     | precise | `body:has`/`html:has`/`:root:has`/`*:has` in a stylesheet **(CSS)**                              | [performance-recipes.md](./performance-recipes.md#recipe-delete-a-global-has-rule)                                         |
| `non-compositor-animation`       | high     | normal  | `transition: all`, layout properties, or bare-duration shorthand **(CSS)**                       | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `tailwind-transition-all`        | high     | noisy   | `transition-all` utility class, in JSX or a variant module                                       | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `keyframes-layout-animation`     | high     | normal  | Layout property (`width`/`height`/`top`/`left`) inside `@keyframes` **(CSS)**                    | [audit.md](#step-15-css-loading-and-architecture-pass)                                                                     |
| `when-visible-no-fallback`       | high     | noisy   | `WhenVisible`/`WhenIdle` without a fallback; verify whether mount changes in-flow size **(JSX)** | [rendering-recipes.md](./rendering-recipes.md)                                                                             |
| `raw-io`                         | medium   | normal  | `new IntersectionObserver` outside the pool                                                      | [performance.md](./performance.md#observer-pooling)                                                                        |
| `raw-ro`                         | medium   | normal  | `new ResizeObserver` outside the pool                                                            | [performance.md](./performance.md#observer-pooling)                                                                        |
| `raw-matchmedia`                 | medium   | normal  | `matchMedia(` outside the pool                                                                   | [use-media-query.md](./use-media-query.md)                                                                                 |
| `js-opacity-transform`           | medium   | noisy   | `style.opacity`/`style.transform` writes (browser-driven candidate)                              | [decision-guide.md](./decision-guide.md#tier-1-browser-driven-css-or-waapi)                                                |
| `permanent-will-change`          | medium   | normal  | `will-change` never toggled with animation state **(CSS)**                                       | [performance.md](./performance.md#will-change-only-while-animating)                                                        |
| `redundant-mutation-observers`   | medium   | normal  | MutationObserver on `<html>`/`documentElement`                                                   | [performance-recipes.md](./performance-recipes.md#recipe-collapse-an-observer-storm-on-html)                               |
| `tailwind-permanent-will-change` | medium   | noisy   | `will-change-transform` class not toggled with state                                             | [performance.md](./performance.md#will-change-only-while-animating)                                                        |
| `reduced-motion-ignored`         | medium   | precise | `reducedMotion: 'ignore'` (bypasses the user preference)                                         | [performance.md](./performance.md#reduced-motion-by-default)                                                               |
| `core-primitive-in-component`    | medium   | noisy   | `createLoop`/`createTicker`/`createLifecycle`/`createSight` in a component **(JSX)**             | [decision-guide.md](./decision-guide.md#common-mistakes)                                                                   |
| `phase-loop-browser-keyframes`   | medium   | noisy   | Phase loop combining `frame.elapsed` with transform/opacity-style writes                         | [decision-guide.md](./decision-guide.md#browser-driven-timelines-css-or-waapi)                                             |
| `manual-synced-ref`              | dedup    | precise | `useRef(v)` + unconditional `ref.current = v` (shorthand exists)                                 | [use-synced-ref.md](./use-synced-ref.md)                                                                                   |
| `manual-stable-callback`         | dedup    | precise | `useCallback` with empty deps calling through a ref **(JSX)**                                    | [use-stable-callback.md](./use-stable-callback.md)                                                                         |

> Manual heuristics the scanner cannot see: CSS-in-JS (styled-components, emotion, vanilla-extract) hides the CSS signals entirely (JS signals still fire); Vue/Svelte/Astro single-file components are not scanned at all; in React Native code, `missing-reduced-motion` findings need judgment (the fix is the platform's reduced-motion API, not a CSS media query); `getBoundingClientRect()` used only for an initial in-view check; and hand-wired "IO + visibilitychange + reduced motion → boolean" gates. See [Common replacements](#common-replacements).

> Known blind spots in the CSS signals: a vendor-prefixed declaration with no unprefixed sibling (`-webkit-transition: all` alone) is skipped, because prefix-aware matching is what stops one logical declaration being counted five times. Lines over 1,000 characters are treated as generated and skipped, so a stylesheet compacted onto one line reports nothing.

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

### Opportunity checks (scanner-silent)

A clean scan means no anti-pattern candidates, not no opportunities: the scanner finds what is wrong, this pass finds what phase would make better. Walk the entry points from Step 0 and check for:

- **Long-running or infinite CSS animations** (spinners, marquees, animated gradients) with no visibility gating. Even with reduced-motion handled, they burn CPU/GPU off-screen and in background tabs. → `useLifecycle` toggling `animation-play-state` (see [decision-guide.md](./decision-guide.md)).
- **`transitionend`/`animationend` listeners driving unmount or state.** → `Presence` / `Swap`.
- **Eagerly mounted non-critical UI** (below-fold sections, chat widgets, pickers, heavy modals). → `Defer` (SSR-safe default) or `WhenVisible`/`WhenIdle`, subject to the [Step 2.5](#step-25-verify-the-blast-radius) semantics rules.
- **`setTimeout`/`setInterval` chains sequencing UI states.** The scanner only flags timers near animation keywords; sequencing timers without them are invisible to it. → CSS/WAAPI when the sequence is predetermined and keyframe-friendly; `useLoop` with `frame.elapsed` only when JavaScript must own the steps ([timed-sequences.md](./timed-sequences.md)).
- **Phase loops replaying a predetermined timeline** (scanner: `phase-loop-browser-keyframes`). Verify that output depends only on elapsed time, can be expressed as browser-animatable keyframes, and requires no per-frame JS side effects. → CSS/WAAPI for playback, with `useLifecycle` as the visibility gate. Also verify that first-paint CSS matches keyframe zero and reduced motion renders a meaningful static state instead of pausing there.
- **Scroll listeners doing position math without layout reads.** The scanner only flags handlers that read layout. → `useScroll`.
- **A canvas or bitmap sized from `devicePixelRatio` once.** Reading it at mount and never again leaves the surface blurry after a browser zoom or a move to a different-density monitor, which reads as a rendering bug rather than a perf one. → `useDevicePixelRatio` ([use-device-pixel-ratio.md](./use-device-pixel-ratio.md)).
- **JS still running inside a skipped `content-visibility: auto` subtree.** Containment stops rendering work, not timers, observers, or loops; the subtree keeps computing for content the browser is not painting. → `useRenderState` to observe the skipped state and pause ([use-render-state.md](./use-render-state.md)).
- **A ResizeObserver used to pick a layout, not to measure one.** Width compared against breakpoints to choose a variant is a container query wearing an observer's clothes. → `useContainerQuery` ([use-container-query.md](./use-container-query.md)).

Each opportunity still goes through Step 2 classification and Step 2.5 blast-radius verification like any scanner candidate; "no change" remains a valid verdict when the current code is already the cheapest sufficient tier.

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
Browser-driven (CSS / WAAPI)  →  Minimal JS (useTween)  →  phase primitives  →  External library  →  No change
```

### Classification questions

1. **Can the browser own playback?** (state toggle, enter/exit, or browser-animatable keyframes on a document/scroll/view timeline)
   → Recommend CSS for static keyframes or WAAPI for generated/imperatively controlled keyframes. Remove per-frame JS.

2. **Is it a single numeric value into React render?** (counter, progress bar, opacity from data)
   → Recommend `useTween`.

3. **Does it need live per-frame JS, visibility pausing, or lifecycle awareness?**
   → Recommend phase (`useLoop`, `useCanvas`, `useLifecycle`, `Presence`, `Swap`, `WhenVisible`). Browser-driven playback can still use `useLifecycle` without a phase-owned frame loop.

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
**Recommendation:** <CSS/WAAPI | useTween | useLoop | useCanvas | useLifecycle | Presence | Swap | WhenVisible | external library | no change>
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

After applying fixes, re-run the same scan command and **compare the finding sets, not the counts**. A count that fell proves nothing on its own: a finding also disappears when a file is renamed into an excluded path, when a comment happens to mention `prefers-reduced-motion`, or when a line grows past the scanner's length limit. Capture both runs and diff them:

```bash
node <skill-dir>/scripts/scan.mjs --json <target> > /tmp/scan-before.json
# ...apply fixes...
node <skill-dir>/scripts/scan.mjs --json <target> > /tmp/scan-after.json
```

Every finding present in `before` and absent from `after` must map to one of:

- a fix you applied and can point at in the diff,
- a finding explicitly classified "no change" in your report, or
- a suppression directive the user approved.

A finding that vanished for none of those reasons is a regression in the audit, not a success. Note also that `filesScanned` must not drop between runs: fewer files analyzed means less coverage, not fewer problems.

If new signals appear (a fix can introduce a different anti-pattern), classify and fix those too. When the work is performance-motivated, measure frame time before and after; an audit without measurement is speculation.

## Scope and handoffs

phase audits what its references can defend: animation lifecycle, rendering gating, observer/listener hygiene, and CSS animation cost. It does **not** audit React data flow, Next.js data fetching (request waterfalls), bundle architecture, caching strategy, or server-component boundaries. A recommendation this skill cannot back with one of its reference files is not a phase recommendation.

While reading context (Step 2.5) you will see adjacent issues. The protocol:

- **Do not fix them under this skill, and do not silently drop them.**
- Append an **Out of scope** section to the report listing each one (one line: file, issue, domain).
- Point to the right skill for the domain: React and Next.js performance (waterfalls, bundle size, server-side performance, re-render architecture) belongs to `react-best-practices` from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`npx skills add vercel-labs/agent-skills`). If that skill is already installed in the project, offer to run it on the flagged files.
- The same boundary applies in reverse: when another skill's guidance conflicts with a phase micro-optimization, defer to the more framework-aware guidance and say so.

## Rules

- **Never recommend a higher tier than needed.** Browser-driven playback is always preferred when it works.
- **Never recommend phase where CSS suffices.** If `transition: opacity 300ms` does the job, say so.
- **Never recommend an external library where phase suffices.** If it doesn't need springs or gestures, phase is enough.
- **"No change" is a valid recommendation.** If the code is already optimal, say so and move on.
- **Always address reduced motion.** If the candidate has no reduced-motion handling, the recommendation must include it.
- **Always address cleanup.** If the candidate leaks listeners/observers/rAF handles, the recommendation must include proper teardown.
- **Show before/after code.** Keep snippets minimal, only the relevant change, not the entire file.
- **Never trade rendering semantics for performance silently.** Changes to SSR HTML presence, hydration, or streaming are semantics-changing (Step 2.5): label them and get explicit consent.
- **Out-of-domain findings are handed off, not improvised.** See [Scope and handoffs](#scope-and-handoffs).

## When NOT to run the audit

Skip the audit when the codebase was audited recently and has not changed since. A zero-candidate scan by itself does not end an audit: the [opportunity checks](#opportunity-checks-scanner-silent) and the manual heuristics still apply.

## Severity weighting

The scanner encodes this ranking; text output is already grouped by it. When the scan returns many candidates, work top-down:

1. **Critical.** Forced reflows in hot paths (observer callbacks, event handlers, rAF), per-frame `setState`, and missing reduced-motion handling cause visible jank or accessibility failures. Fix first.
2. **High.** Always-on background work (rAF without visibility pausing, timers animating off-screen, global `:has()` invalidation) wastes CPU and battery. Fix second.
3. **Medium.** Redundant observers, missing pooling, and cheaper-tier candidates leak resources or carry avoidable cost. Fix third.
4. **Dedup.** Correct code with a phase shorthand (manual synced refs). Fix last or never.

## Common replacements

| Current pattern                                                      | Replace with                                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual `requestAnimationFrame` loop + `cancelAnimationFrame` cleanup | CSS/WAAPI if browser-animatable; `useLoop` (DOM) or `useCanvas` (canvas) when frames require live JS                                                                                               |
| `requestAnimationFrame` without `cancelAnimationFrame`               | Same tier decision, plus phase cleanup is automatic when a loop is required                                                                                                                        |
| `new IntersectionObserver` for visibility                            | `useSight` or `useLifecycle`                                                                                                                                                                       |
| `new IntersectionObserver` for scroll progress                       | `useScrollProgress`                                                                                                                                                                                |
| `new ResizeObserver` for dimensions                                  | `useSize`                                                                                                                                                                                          |
| Raw `MutationObserver` with reflow reads in callback                 | `useMutation` (rAF-batched, visibility-aware)                                                                                                                                                      |
| `MutationObserver` on `style`/`attributes` to track size or position | `useSize` (ResizeObserver) / `useSight` (IO); reserve MO for `childList`                                                                                                                           |
| Multiple `MutationObserver` on `<html>` for class changes            | Single `useMutation` with coalesced callback                                                                                                                                                       |
| `matchMedia('(prefers-reduced-motion: reduce)')`                     | `prefersReducedMotion()` or rely on phase hooks (automatic)                                                                                                                                        |
| `matchMedia(query)` + change listener                                | `useMediaQuery` (pooled MQL, reactive)                                                                                                                                                             |
| `useState` + `requestAnimationFrame` for tween                       | `useTween`                                                                                                                                                                                         |
| `useState` inside rAF for DOM writes                                 | `useLoop` with ref-based writes                                                                                                                                                                    |
| `getBoundingClientRect()` in animation                               | `useSize` (async, no reflow)                                                                                                                                                                       |
| `getBoundingClientRect()` in a `pointermove` handler                 | `usePointer` (one rAF-batched `getBoundingClientRect` per frame, not per event)                                                                                                                    |
| SVG transform/geometry attributes written during animation           | CSS `transform`/`opacity` on an HTML wrapper; verify browser support and `transform-box` before transforming an SVG element directly                                                               |
| `transitionend` listener for unmount                                 | `<Presence>` or `usePresence`                                                                                                                                                                      |
| Multiple independent rAF loops                                       | Multiple `useLoop` instances (shared clock)                                                                                                                                                        |
| CSS-only animation that's working fine                               | No change. Don't add JS where it's not needed.                                                                                                                                                     |
| Hand-wired IO + visibilitychange + reduced motion → boolean          | `useLifecycle` (single hook, same signals, pooled IO)                                                                                                                                              |
| `getBoundingClientRect()` for initial in-view check                  | Trust IO (one-frame delay is invisible) or `rootMargin`                                                                                                                                            |
| Permanent `will-change-transform`                                    | Toggle with animation state; or remove entirely for JS loops                                                                                                                                       |
| Tailwind `transition-all`                                            | Name the transitioned properties: `transition-colors`, `transition-transform`, `transition-[color,box-shadow]`                                                                                     |
| `setTimeout`/`setInterval` for timed animation sequences             | CSS/WAAPI + `useLifecycle` when predetermined and keyframe-friendly; `useLoop` with elapsed-time steps only when JavaScript must own the timeline (see [timed-sequences.md](./timed-sequences.md)) |
| `useRef(v)` + unconditional `ref.current = v` on every render        | `useSyncedRef(v)` (dedup, the raw pattern is correct, only verbose)                                                                                                                                |
| `useCallback` with empty deps calling through a ref                  | `useStableCallback(fn)` (dedup, the same idiom in one line)                                                                                                                                        |
| Heavy panel always mounted with `display:none`                       | Conditional rendering + `Presence` + `useWhenIdle` prefetch                                                                                                                                        |
| N components with bare `window.addEventListener('resize', ...)`      | `useSize` or `useMediaQuery` (pooled observers, no raw listeners)                                                                                                                                  |
| `scroll` handler reading `scrollWidth`/`clientWidth`                 | `useScroll` (rAF-batched offset + progress; geometry cached, read only on resize, not per event)                                                                                                   |
| Global `body:has(...)` in stylesheet                                 | Scope with a subtree-scoped `<style>` or data-attribute pattern                                                                                                                                    |
| Large list without `content-visibility`                              | `Defer` with `as` prop for semantic elements                                                                                                                                                       |
| `WhenVisible`/`WhenIdle` with no `fallback`                          | Verify the final in-flow footprint; reserve it through the wrapper, parent, or `fallback` when nonzero                                                                                             |
| `@keyframes` animating `height`/`width`/`top`/`left`                 | Keyframe `transform`/`opacity`; for expand/collapse use `grid-template-rows` transitions or measure once with `useSize`                                                                            |

### Outside React

Every row above names a hook because React is the common case, and recommending a hook to a consumer who is not using React is not a recommendation. The scanner reads `.js`/`.ts` regardless of framework, so check what the file is before you answer. Outside React — vanilla, Vue, Svelte, Astro islands, web components — substitute the core primitive, which carries the same lifecycle guarantees and differs only in binding:

| Hook                               | Core primitive                         |
| ---------------------------------- | -------------------------------------- |
| `useLoop`, `useCanvas`, `useTween` | `createLoop`, `createTicker`           |
| `useSight`                         | `createSight`                          |
| `useLifecycle`                     | `createLifecycle`                      |
| `usePointer`                       | `createPointer`                        |
| `useScroll`, `useScrollProgress`   | `createScroll`, `createScrollProgress` |
| `useMutation`                      | `createMutation`                       |
| `useRenderState`                   | `createRenderState`                    |
| `useDevicePixelRatio`              | `createDevicePixelRatio`               |
| `usePrefersReducedMotion`          | `prefersReducedMotion()`               |
| `useIdle`, `useWhenIdle`           | `whenIdle`                             |

`useSize`, `useMediaQuery`, and `useContainerQuery` have no core export: outside React, use `createLifecycle` for the visibility half and the pooled observers behind it. The composition components (`Presence`, `Swap`, `WhenVisible`, `WhenIdle`, `Defer`) are React-only by nature; outside React, recommend the equivalent pattern (a state class toggled on `transitionend`, or `content-visibility`) rather than naming a component the consumer cannot import.

## Reviewing phase code

After implementing, migrating, or reviewing animation code that uses phase, ask: **is it using phase to the best of its ability?** Four questions frame the review:

1. **Right tier?** Could CSS or WAAPI describe the whole timeline up front? In particular, does a `useLoop` derive output only from `frame.elapsed` and write transform/opacity-style values? Could `useTween` replace a loop that only animates one value? Is an external library needed (springs, gestures)? The cheapest tier that works wins.
2. **Right primitive?** Within the phase tier, is each primitive the best fit for what it's doing? Read the relevant reference file's "When to use" / "When not to use" tables.
3. **Right options?** Is `fps` set appropriately (e.g., `fps: 1–2` for state-machine transitions, not 60)? Should a hook use transient mode (`onProgress` / `onResize` / `onVisibilityChange`) instead of re-rendering? Is `observe: 'once'` appropriate for one-shot triggers?
4. **Missing phase?** Is there animation or rendering code with no lifecycle management — animations running off-screen, raw observers, missing reduced-motion handling, long pages without `Defer`?

The scanner's phase-usage signals surface candidates for these questions automatically: `setstate-in-ontick` (invariant 2 after adoption), `reduced-motion-ignored` and `core-primitive-in-component` (questions 2 and 3), and `when-visible-no-fallback` (a prompt to verify the gated child's final in-flow footprint).

The specific failure modes and correct patterns live in the reference files: [timed-sequences.md](./timed-sequences.md) for the timer anti-pattern and initial-state flash, [performance.md](./performance.md) for hot-path rules, [decision-guide.md](./decision-guide.md) for tier selection and migration mappings.

## Output format

Present findings as a numbered list, grouped by impact:

1. **Critical.** Causes jank or accessibility failures
2. **High.** Wastes significant CPU or leaks resources
3. **Medium.** Suboptimal but functional
4. **Opportunities.** Nothing is wrong, but phase would make it better: the scanner-silent wins from [Step 1.5](#opportunity-checks-scanner-silent). Same recommendation shape as a finding, with no severity
5. **No change.** Already well-implemented (list briefly for completeness)
6. **Out of scope.** Adjacent issues for other skills (one line each, naming the skill to use)

Opportunities are a required section, not an optional one: omitting it means the report claims the scan's coverage as the audit's coverage. Write "none found" when the manual passes turned up nothing, so the reader can tell you looked.

End with a summary: "Found N candidates, M actionable, P opportunities, K already optimal."
