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

The scanner ships with the skill. You don't need to install anything else. Once the skill is installed, ask your agent to audit your animation code; it reads `SKILL.md` → `references/audit.md`, runs `scripts/scan.mjs`, and classifies the findings against the decision ladder. To run it standalone:

```bash
node <skill-dir>/scripts/scan.mjs <target-dir>
```

## What's inside

| File               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `SKILL.md`         | Entry point — decision tables, invariants, reference index |
| `AGENTS.md`        | Full compiled document (all references inlined)            |
| `references/*.md`  | One file per public export + cross-cutting guides          |
| `scripts/scan.mjs` | Deterministic anti-pattern scanner for audits              |

## Development

Contributor tooling and the reference template live in the repository-level `scripts/skill/` directory.

```bash
node scripts/skill/check-coverage.mjs   # verify barrels ↔ references
node scripts/skill/build-agents.mjs     # regenerate AGENTS.md
node scripts/skill/package.mjs          # produce dist/phase-skill.zip
```

Or via package.json scripts (from repo root):

```bash
pnpm skill:check
pnpm skill:build
pnpm skill:package
```
