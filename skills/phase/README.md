# phase skill

Agent skill for the [phase](https://github.com/vercel-labs/phase) animation library. Teaches agents to implement phase primitives correctly, follow performant-animation best practices, and audit existing animation code.

## Install

Three paths — pick whichever fits your workflow.

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

## What's inside

| File                         | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `SKILL.md`                   | Entry point — decision tables, invariants, reference index |
| `AGENTS.md`                  | Full compiled document (all references inlined)            |
| `references/*.md`            | One file per public export + cross-cutting guides          |
| `scripts/build-agents.mjs`   | Regenerate `AGENTS.md`                                     |
| `scripts/check-coverage.mjs` | Verify every export has a reference (and vice versa)       |
| `scripts/scan.mjs`           | Deterministic anti-pattern scanner for audits              |
| `scripts/package.mjs`        | Produce `dist/phase-skill.zip`                             |

## Development

```bash
node skills/phase/scripts/check-coverage.mjs   # verify barrels ↔ references
node skills/phase/scripts/build-agents.mjs      # regenerate AGENTS.md
node skills/phase/scripts/package.mjs           # produce dist/phase-skill.zip
```

Or via package.json scripts (from repo root):

```bash
pnpm skill:check
pnpm skill:build
pnpm skill:package
```
