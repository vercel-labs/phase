# Scanner calibration log

Running record of scanner calibration against real-world repositories. Noise tiers are set from observed evidence, not prediction; this log is the evidence. Procedure: "Recalibrating the scanner" in the repo's `AGENTS.md`. Prepend new entries (newest first) and cite the entry in the PR that changes the scanner.

Each entry records: date, skill version and signal count, repos with commit SHAs, per-signal finding counts, sample classification verdicts, and actions taken. Counts are from `scan.mjs --json` over a fresh shallow clone in `/tmp` (never clone into this repo).

## 2026-08-10 — skill 0.0.14, 24 signals

Repos: shadcn-ui/ui `deda4df`, excalidraw/excalidraw `c5a50d2`, vercel/commerce `3761e52`.

| Signal                           | ui (3955 files) | excalidraw (734) | commerce (67) |
| -------------------------------- | --------------- | ---------------- | ------------- |
| `manual-raf`                     | 44              | 9                | 0             |
| `setstate-in-raf`                | 4               | 1                | 0             |
| `setstate-in-ontick`             | 0               | 0                | 0             |
| `forced-reflow`                  | 47              | 182              | 0             |
| `raw-io`                         | 3               | 0                | 0             |
| `raw-ro`                         | 5               | 2                | 0             |
| `raw-matchmedia`                 | 11              | 0                | 0             |
| `mutationobserver-layout`        | 1               | 0                | 0             |
| `js-opacity-transform`           | 2               | 1                | 0             |
| `missing-reduced-motion`         | 17              | 21               | 0             |
| `background-animation`           | 0               | 0                | 0             |
| `manual-synced-ref`              | 0               | 4                | 0             |
| `global-has-selector`            | 0               | 0                | 0             |
| `permanent-will-change`          | 0               | 0                | 0             |
| `non-compositor-animation`       | 0               | 6                | 0             |
| `keyframes-layout-animation`     | 4               | 0                | 0             |
| `bare-window-listener`           | 0               | 1                | 0             |
| `pointer-listener-layout-read`   | 0               | 0                | 0             |
| `redundant-mutation-observers`   | 2               | 0                | 0             |
| `tailwind-transition-all`        | 49              | 0                | 12            |
| `tailwind-permanent-will-change` | 3               | 0                | 0             |
| `reduced-motion-ignored`         | 0               | 0                | 0             |
| `core-primitive-in-component`    | 0               | 0                | 0             |
| `when-visible-no-fallback`       | 0               | 0                | 0             |

Context stamps: ui and excalidraw report Next.js + App Router from example/template apps inside the monorepos (expected coarseness; audit.md tells auditors to scan the package, not the repo root). commerce reports Next.js + App Router + PPR, correct for a real production PPR app.

Sample verdicts (hand-classified during the 2026-08 overhaul):

- `forced-reflow` (excalidraw): dominated by `appState.offsetLeft`/`offsetTop`, property-name collisions on plain state objects, not DOM reads. FP class inherent to line-based matching; `noisy` tier confirmed.
- `setstate-in-raf` (ui): 4/4 true, including a per-frame `setState` audio-visualizer loop (the worst case the signal exists for) and a one-shot defer-by-a-frame (real match, agent classifies).
- `manual-synced-ref` (excalidraw): 4/4 textbook latest-ref idioms. `precise` confirmed.
- `non-compositor-animation` (excalidraw): 6/6 true, including two bare-duration shorthand catches (`transition: 0.5s`).
- `keyframes-layout-animation` (ui): 4/4 true, all the Radix accordion `height` keyframes.
- `raw-matchmedia` (ui): 11/11 true unpooled MQL usage (`use-mobile` hooks, theme providers).
- `pointer-listener-layout-read` (excalidraw): correctly silent; its pointermove handlers read no layout.
- Phase-usage signals (`setstate-in-ontick`, `reduced-motion-ignored`, `core-primitive-in-component`, `when-visible-no-fallback`): zero everywhere, expected, since none of these repos use phase. Their behavior is covered by executable examples, not calibration.

Actions taken across the overhaul's calibration rounds:

- `missing-reduced-motion` switched to per-file reporting (was 53 line findings across 16 ui files; now 17).
- `mutationobserver-layout` tightened to style filters or layout reads (plain class watchers were double-flagged with `redundant-mutation-observers`).
- All other tiers confirmed as declared; no loosening.
