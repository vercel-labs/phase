# phase skill

Agent skill for browser runtime performance across animation, rendering, and loading. It audits any web application, recommends the cheapest safe fix, and teaches agents to use the optional [phase](https://github.com/vercel-labs/phase) runtime library when its primitives fit.

## Install

Three paths. Pick whichever fits your workflow.

### 1. skills.sh (recommended)

```bash
npx skills add vercel-labs/phase --skill phase
```

### 2. Manual copy

Copy the `skills/phase/` directory into your project's `.agents/skills/phase/` (or wherever your agent reads skills from), then reference it from your project's `AGENTS.md`:

```markdown
- [phase skill](.agents/skills/phase/SKILL.md)
```

### 3. Zip download

Download `skills/phase/dist/phase-skill.zip` from this repository, unzip into your skills directory.

## Running an audit

The scanner ships with the skill; nothing else to install. Ask your agent, for example:

- "Audit the animations and rendering in `src/` for performance."
- "This page is janky and the fans spin up while it's idle. Find out why."
- "Find rendering and loading work this route can defer."
- "Scan only the files I changed on this branch."

The agent reads `SKILL.md` → `references/audit.md`, runs the scanner, then classifies every finding against its runtime requirements and rendering semantics. The `phase` package is one possible recommendation, not a requirement for running the audit.

The audit is a repeatable verification loop: scan source, inspect each candidate in context, apply the cheapest safe fix, and scan again. The scanner checks source and does not capture traces. When the user supplies or accepts a Chrome DevTools performance trace, the skill can add measured evidence for the recorded path; without one, it makes no measured runtime claim.

### How recommendations are checked

Findings are candidates, not verdicts. Each carries a severity (impact if real) and a noise tier (how much verification the detection needs). The tiers were calibrated by hand-classifying findings across production open-source applications. The test suite encodes false-positive classes the scanner can distinguish cheaply; `noisy` marks cases it cannot, such as a non-React `dispatch()` near a rAF or a third-party `onTick` API. Before recommending a change, the agent checks its framework, SSR and Next.js PPR context, verifies the blast radius, and labels changes to rendering semantics for explicit consent. It reports data fetching, bundling, and server-component issues for the appropriate skill instead of improvising a fix.

`Scanned N files` counts only files the scanner analyzed. Unreadable targets produce an explicit `⚠ Incomplete coverage` line instead of a clean result.

### Manual audit pass

The scanner finds source patterns that may waste browser work. It cannot detect every opportunity, including a spinner animating off-screen, a `transitionend` listener wired to unmount, a chat widget mounted eagerly, a canvas sized from `devicePixelRatio` once and blurry after a zoom, or timers running in a subtree the browser has stopped painting. The audit reports these manual checks under **Opportunities**, separately from scanner findings. Recommendations outside React map to core primitives such as `createLoop`, `createSight`, and `createPointer` rather than hooks the application cannot import.

### Scanner CLI

```bash
node <skill-dir>/scripts/scan.mjs <dir-or-files...>
git diff --name-only --diff-filter=ACMR -z | node <skill-dir>/scripts/scan.mjs --stdin0
```

| Option                 | Effect                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--json`               | Machine-readable output: summary, environment context, warnings, flat findings |
| `--stdin0`             | Read NUL-delimited targets from stdin; empty input scans nothing               |
| `--fail-on <severity>` | Exit 1 at or above `critical`/`high`/`medium` (for CI); default always exits 0 |
| `--signal <id>`        | Report only this signal (repeatable)                                           |
| `--severity <level>`   | Report only this severity (repeatable)                                         |
| `--noise <tier>`       | Report only this noise tier (repeatable)                                       |
| `--exclude <path>`     | Skip paths containing this text, or matching it as a glob (repeatable)         |
| `--limit <n>`          | Cap the findings array in `--json` output                                      |
| `-h`, `--help`         | Usage                                                                          |

Exit codes: `0` scan completed (advisory default), `1` `--fail-on` threshold hit, `2` usage error. A clean scan reports how many files it scanned; zero scannable files prints a warning instead of a green result. Requires Node 20 or newer.

The report opens with the files carrying the most candidates, and within each signal it lists the lines a proven recurring frame callback, observer, or move handler runs before the incidental ones. A one-shot rAF does not make nearby work per-frame. Every block names why it matters and what to use instead, so you can act without opening the reference.

Text output caps each signal's listing, and caps again per file, so one noisy pattern or one busy file cannot bury the rest. On a big report, narrow before reading:

```bash
node <skill-dir>/scripts/scan.mjs --noise precise --noise normal --exclude examples/ src
```

`--json` is uncapped by design; scope it (`--json --signal <id>`) rather than dumping a whole large codebase.

To permanently accept a finding, add a comment on or above the line (the reason is mandatory):

```ts
// phase-scan-ignore manual-raf -- accepted: replaced next sprint
```

Signal reference, output anatomy, and the full audit procedure: `references/audit.md`.

## What's inside

| File               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `SKILL.md`         | Entry point — decision tables, invariants, reference index |
| `references/*.md`  | One file per public export + cross-cutting guides          |
| `scripts/scan.mjs` | Deterministic anti-pattern scanner for audits              |

## Development

Contributor tooling and eval scenarios live in the private [`packages/skill`](https://github.com/vercel-labs/phase/tree/main/packages/skill) workspace so they never enter skill installations. Start new references from `references/_template.md`. Follow the package's [`AGENTS.md`](https://github.com/vercel-labs/phase/blob/main/packages/skill/AGENTS.md) when changing scanner signals, evals, or generated artifacts.

Run the stable contributor commands from the repository root:

```bash
pnpm skill:check
pnpm skill:build
pnpm skill:package
```
