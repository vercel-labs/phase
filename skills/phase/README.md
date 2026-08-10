# phase skill

Agent skill for the [phase](https://github.com/vercel-labs/phase) animation library. Teaches you to implement phase primitives correctly, follow performant-animation best practices, and audit existing animation code.

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
- "Scan only the files I changed on this branch."

The agent reads `SKILL.md` → `references/audit.md`, runs the scanner, then classifies every finding against the decision ladder (CSS-only → `useTween` → phase → external library → no change).

### Why you can trust the recommendations

Findings are candidates, not verdicts: each carries a severity (how bad if real) and a noise tier (how much to trust the detection), calibrated by hand-classifying findings across production open-source codebases spanning the consumer mix. False-positive classes cheap enough to detect are encoded as executable regression examples in the test suite; the ones that are not — a non-React `dispatch()` near a rAF, a third-party `onTick` API — are what the `noisy` tier is telling you about. Before recommending anything, the agent must verify the blast radius (framework, SSR, Next.js PPR; the scanner detects and stamps these) and label any recommendation that changes rendering semantics, which requires your explicit consent. Issues outside phase's domain (data fetching, bundling, server components) are reported and handed to the right skill, never improvised.

The scanner also refuses to overstate its coverage: `Scanned N files` counts files it actually analyzed, and anything it could not read is reported as an explicit `⚠ Incomplete coverage` line rather than folded into a clean result.

### Scanner CLI

```bash
node <skill-dir>/scripts/scan.mjs <dir-or-files...>
git diff --name-only | xargs node <skill-dir>/scripts/scan.mjs   # changed files only
```

| Option                 | Effect                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--json`               | Machine-readable output: summary, environment context, warnings, flat findings |
| `--fail-on <severity>` | Exit 1 at or above `critical`/`high`/`medium` (for CI); default always exits 0 |
| `--signal <id>`        | Report only this signal (repeatable)                                           |
| `--limit <n>`          | Cap the findings array in `--json` output                                      |
| `-h`, `--help`         | Usage                                                                          |

Exit codes: `0` scan completed (advisory default), `1` `--fail-on` threshold hit, `2` usage error. A clean scan reports how many files it scanned; zero scannable files prints a warning instead of a green result. Requires Node 20 or newer.

Text output caps each signal's listing so one noisy pattern cannot bury the report or an agent's context window. `--json` is uncapped by design; scope it (`--json --signal <id>`) rather than dumping a whole large codebase.

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

Contributor tooling lives in the repository-level `scripts/skill/` directory. Start new references from `references/_template.md`. To add or change a scanner signal, follow "New scanner signal (audit skill)" in the repo's `AGENTS.md` (examples first, probe against real code, calibrate the noise tier). Eval scenarios and the scanner's calibration log live in [`evals/`](evals/) (repo-only, excluded from the shipped zip).

```bash
node scripts/skill/check-coverage.mjs   # verify barrels ↔ references
node scripts/skill/build-metadata.mjs   # regenerate metadata.json
node scripts/skill/package.mjs          # produce dist/phase-skill.zip
```

Or via package.json scripts (from repo root):

```bash
pnpm skill:check
pnpm skill:build
pnpm skill:package
```
