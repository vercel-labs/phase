# Scanner calibration log

Running record of scanner calibration against real-world repositories. Noise tiers are set from observed evidence, not prediction; this log is the evidence. Procedure: "Recalibrating the scanner" in the repo's `AGENTS.md`. Prepend new entries (newest first) and cite the entry in the PR that changes the scanner.

Each entry records: date, skill version and signal count, repos with commit SHAs, per-signal finding counts, sample classification verdicts, and actions taken. Counts are from `scan.mjs --json` over a fresh shallow clone in `/tmp` (never clone into this repo).

## 2026-08-10 — 10-repo campaign, skill 0.0.14, 24 signals

Broader pre-ship validation across diverse production profiles plus deliberate blind-spot probes. Repos: calcom/cal.com `176037d`, dubinc/dub `cc8f021`, outline/outline `6061964`, twentyhq/twenty `f9a0a202`, payloadcms/payload `dc3e666`, makeplane/plane `1c8a60f`, bluesky-social/social-app `51401e4`, openstatusHQ/openstatus `57517b6`, elk-zone/elk `8aa2b46`, documenso/documenso `962cffc`.

Post-fix totals (files scanned / findings / context): calcom 5034/167 next, dub 4122/266 next, outline 2418/150 none, twenty 23011/493 next, payload 7525/240 next+ppr, plane 3325/315 next, bluesky 1800/101 none, openstatus 2240/39 next, elk 133/4 none, documenso 2090/104 next.

Verdicts and first real observations:

- **Vendored/bundled noise was the campaign's biggest FP source, now fixed.** calcom and twenty's entire `background-animation` counts (6 and 20) were `.yarn/releases/*.cjs` binaries and committed seed bundles (minified React in `seed-project/*/index.mjs`); two of calcom's `setstate-in-raf` hits were also in the yarn bundle. Fixes: `.yarn` added to skip lists, and a content-level minified-file heuristic (average line length > 500 skips the file, whatever it is named).
- `background-animation` (payload, 5, first genuine observations): tooltip `setTimeout(() => setIsMounted(false), 200)` is the textbook `Presence` replacement (true), drag-handle fade timers are genuine candidates, an autosave debounce is a false positive (context word collision). Mixed picture; `noisy` tier validated.
- `global-has-selector` (payload, 2): `body:has(.drawer--is-open)` and `body:has(.drag-overlay) *`, textbook true positives. `precise` validated in the wild.
- `permanent-will-change` (payload 1, plane 2): permanent `will-change` in global stylesheets including layout properties (`will-change: width, opacity`). True positives.
- `keyframes-layout-animation` (calcom 15, twenty 8, openstatus 4): calcom's are real `height: 0% -> 100%` reveal keyframes. True positives.
- `tailwind-permanent-will-change` (calcom 6, dub 1): always-on `will-change-transform` in dialog/sheet component class strings. Genuine review candidates.
- **Finding storms**: dub 179 and plane 204 `tailwind-transition-all` hits. Text output now caps listings at 20 per signal with a remainder count (`--json` for the full list) so a storm cannot bury the rest of the report or an agent's context window.

Blind spots confirmed as documented (audit.md already marks these manual):

- Vue/Nuxt (elk): 133 scannable files in an entire Mastodon client; `.vue` SFCs are invisible to the scanner.
- styled-components (outline) and emotion (twenty): JS signals fire normally, CSS signals near-silent because styles live in template literals.
- React Native (bluesky): `.tsx` scans fine; `missing-reduced-motion` findings there need judgment (RN has no CSS media queries; the fix is `useReducedMotion` from the platform, not `prefers-reduced-motion`).

Still zero genuine observations: `setstate-in-ontick`, `pointer-listener-layout-read`, and the remaining phase-usage signals (no scanned repo uses phase). Their tiers remain example-guarded predictions.

## 2026-08-10 — skill 0.0.14, 24 signals

Repos: shadcn-ui/ui `deda4df`, excalidraw/excalidraw `c5a50d2`, vercel/ai-chatbot `c2f8235`.

| Signal                           | ui (3955 files) | excalidraw (734) | ai-chatbot (156) |
| -------------------------------- | --------------- | ---------------- | ---------------- |
| `manual-raf`                     | 44              | 9                | 1                |
| `setstate-in-raf`                | 4               | 1                | 2                |
| `setstate-in-ontick`             | 0               | 0                | 0                |
| `forced-reflow`                  | 47              | 182              | 15               |
| `raw-io`                         | 3               | 0                | 0                |
| `raw-ro`                         | 5               | 2                | 2                |
| `raw-matchmedia`                 | 11              | 0                | 1                |
| `mutationobserver-layout`        | 1               | 0                | 0                |
| `js-opacity-transform`           | 2               | 1                | 0                |
| `missing-reduced-motion`         | 17              | 21               | 4                |
| `background-animation`           | 0               | 0                | 0                |
| `manual-synced-ref`              | 0               | 4                | 1                |
| `global-has-selector`            | 0               | 0                | 0                |
| `permanent-will-change`          | 0               | 0                | 0                |
| `non-compositor-animation`       | 0               | 6                | 0                |
| `keyframes-layout-animation`     | 4               | 0                | 0                |
| `bare-window-listener`           | 0               | 1                | 0                |
| `pointer-listener-layout-read`   | 0               | 0                | 0                |
| `redundant-mutation-observers`   | 2               | 0                | 0                |
| `tailwind-transition-all`        | 49              | 0                | 12               |
| `tailwind-permanent-will-change` | 3               | 0                | 0                |
| `reduced-motion-ignored`         | 0               | 0                | 0                |
| `core-primitive-in-component`    | 0               | 0                | 0                |
| `when-visible-no-fallback`       | 0               | 0                | 0                |

Context stamps: ui and excalidraw report Next.js + App Router from example/template apps inside the monorepos (expected coarseness; audit.md tells auditors to scan the package, not the repo root). ai-chatbot reports Next.js + App Router + PPR with 57 client components, correct for a single production PPR app. PPR detection was also validated on vercel/commerce `3761e52` before it was swapped out of the standing mix for ai-chatbot, which exercises 8 signals to commerce's 1.

Sample verdicts (hand-classified during the 2026-08 overhaul):

- `forced-reflow` (excalidraw): dominated by `appState.offsetLeft`/`offsetTop`, property-name collisions on plain state objects, not DOM reads. FP class inherent to line-based matching; `noisy` tier confirmed.
- `setstate-in-raf` (ui): 4/4 true, including a per-frame `setState` audio-visualizer loop (the worst case the signal exists for) and a one-shot defer-by-a-frame (real match, agent classifies).
- `setstate-in-raf` (ai-chatbot): 1 true (`setIsAtBottom(true)` inside a rAF in `hooks/use-scroll-to-bottom.tsx`), 1 false (the context window caught CodeMirror's `dispatch(transaction)` in `components/chat/code-editor.tsx`, an editor transaction, not React state). New observed FP class: non-React `dispatch(` from editor/store libraries near a rAF. `normal` tier ("verify quickly") confirmed as the right level.
- `manual-synced-ref` (excalidraw): 4/4 textbook latest-ref idioms. `precise` confirmed.
- `non-compositor-animation` (excalidraw): 6/6 true, including two bare-duration shorthand catches (`transition: 0.5s`).
- `keyframes-layout-animation` (ui): 4/4 true, all the Radix accordion `height` keyframes.
- `raw-matchmedia` (ui): 11/11 true unpooled MQL usage (`use-mobile` hooks, theme providers).
- `pointer-listener-layout-read` (excalidraw): correctly silent; its pointermove handlers read no layout.
- Phase-usage signals (`setstate-in-ontick`, `reduced-motion-ignored`, `core-primitive-in-component`, `when-visible-no-fallback`): zero everywhere, expected, since none of these repos use phase. Their behavior is covered by executable examples, not calibration.

Alternates evaluated for the standing mix (not adopted, recorded for future swaps):

- tldraw/tldraw `4b4ba64` (2836 files): 320 findings across 14 signals, the broadest coverage of any repo probed, including `global-has-selector` (3) and `setstate-in-ontick` (1). Two instructive observations: its `setstate-in-ontick` hit is a name-collision FP (tldraw's own `onTick` state-machine API with `editor.setCursor(...)` in context, a tldraw editor call, not React state), and the repo is SDK-weighted, so many raw-rAF findings are library internals rather than consumer-shaped code. Kept excalidraw for the canvas slot (more app-weighted, source of the `appState.offset*` FP class baseline); use tldraw as an extra repo when calibrating pointer/rAF or CSS-selector signals.

Actions taken across the overhaul's calibration rounds:

- `missing-reduced-motion` switched to per-file reporting (was 53 line findings across 16 ui files; now 17).
- `mutationobserver-layout` tightened to style filters or layout reads (plain class watchers were double-flagged with `redundant-mutation-observers`).
- All other tiers confirmed as declared; no loosening.
