# phase skill-maintainer instructions

This private package owns scanner source, scanner tests, eval scenarios, and the tooling that builds the installable skill at `../../skills/phase/`. Run contributor commands from the repository root. Read [`../../CONTEXT.md`](../../CONTEXT.md) before changing scanner, audit, or eval behavior.

## Package boundary

- `scanner/` contains typed scanner modules and tests.
- `evals/` contains contributor-only scenarios and adversarial fixtures.
- `scripts/skill/` contains coverage, generation, packaging, and safety checks.
- `tsdown.scanner.config.ts` bundles `scanner/cli.ts` to `../../skills/phase/scripts/scan.mjs`.
- `../../skills/phase/` contains only consumer content and committed artifacts. `pnpm skill:check` enforces its allowlist and the scanner's `node:`-builtin-only import contract.

Hand-edit `../../skills/phase/SKILL.md`, `README.md`, and `references/*.md`. Start references from `../../skills/phase/references/_template.md`.
Fix sections use ATX headings. Avoid setext headings and thematic breaks in files targeted by signal fix pointers because extraction rejects their ambiguous underline syntax.

Never hand-edit these generated artifacts:

- `scanner/fix-sections.gen.ts`
- `../../skills/phase/metadata.json`
- `../../skills/phase/scripts/scan.mjs`
- `../../skills/phase/dist/phase-skill.zip`
- The signal-table and scan-golden marker regions in `../../skills/phase/references/audit.md`

## Adding a scanner signal

The scanner reports anti-pattern candidates, not confirmed defects. Every signal ships with executable examples and calibrated triage metadata. Keep signals within animation lifecycle, rendering gating, observer/listener hygiene, or CSS animation cost. Hand adjacent React or Next.js performance concerns to the appropriate skill.

1. Add the catalog entry to `SIGNALS` in `scanner/signals.ts`. Use a kebab-case `id`, `label`, severity (`critical`, `high`, `medium`, or `dedup`), noise (`precise`, `normal`, or `noisy`), one-line `detects`, `why`, and `replacement` text, plus a valid `references/<file>#anchor` fix pointer. Detection is a `pattern` plus optional `contextPattern` (within five lines by default; set `contextLines` only with a regression example), or a pure custom `matcher`. Declare reusable static-analysis evidence by name from `EVIDENCE_REGISTRY` in `scanner/analysis.ts`; do not add signal-specific branches to the engine. Optional catalog fields are `fileTypes`, `supersedes`, `perFile`, `codeOnly`, and `evidence`.
2. Use `negativePattern` only for whole-file `perFile` signals. Write a matcher for declaration-local or enclosing-rule conditions. Avoid ambiguous quantified regex groups that can match empty; scanner input is untrusted third-party code and must not trigger exponential matching.
3. Add at least one `match` and one `noMatch` example under the same id in `scanner/examples.ts`. Add a `noMatch` regression for every false-positive class the signal must avoid.
4. Make the example test red before tuning detection: `pnpm --filter @usephase/skill exec vitest run scanner/__tests__/examples.spec.ts`. Set severity for worst-case impact and let execution class rank per-frame findings above incidental findings.
5. Probe, do not only read: run `pnpm skill:build && node skills/phase/scripts/scan.mjs <path>` against representative real code. Hand-classify a bounded sample, set the noise tier from evidence, and record the profile and actions in the PR description.
6. Run `pnpm skill:build`. `pnpm skill:check` verifies fix-section extraction, the generated signal table, eval contracts, and the distribution boundary.
7. If the signal changes `evals/scenarios/audit-planted-defects/workspace`, run `pnpm goldens` to regenerate both goldens and the audit sample in order.
8. Run `pnpm format:fix && pnpm validate`.

## Evaluation scenarios

Encode confirmed audit failures under `evals/scenarios/` so they remain executable regression guards. Use `ssr-semantics-guard` as the structural example and `evals/README.md` as the contract.

- Every scenario has a neutral, non-empty `prompt.md` and a validated `expected-findings.json`.
- Put machine-checkable behavior in `scan.assertions` or named `scan.runs`: `required`, `requiredAbsent`, `outputExcludes`, and `context`.
- Keep model-judged behavior in `expectedBehavior`; it is a non-gating rubric.
- `scanner/__tests__/scenarios.spec.ts` executes gates and goldens.
- Encode adversarial control characters with the documented tokens. The test harness materializes them only in a temporary copy.
- Keep fixture manifests inert. They describe environment context and must not contain runnable project scripts or dependencies.

## Recalibrating the scanner

Noise tiers come from hand-classifying findings on representative real code. Recalibrate every changed signal, after a false-positive or false-negative report, and before a release that changes the scanner.

1. Shallow-clone two or three actively maintained applications outside this repository. Use a Tailwind-heavy component library, a canvas or whiteboard-style app, and a production Next.js App Router app when relevant. Add a profile likely to exercise the signal under review.
2. Choose consumer-like applications, not animation engines. Avoid SDK-heavy monorepos whose internals and unrelated `onTick` APIs skew the sample.
3. Run `node skills/phase/scripts/scan.mjs --json <repo>` for each repository. Compare per-signal counts before and after; a count that moved without a corresponding scanner change is a finding to investigate.
4. Sample up to about ten findings for each changed or `noisy` signal and classify each against the signal's `why`.
5. Turn every confirmed false-positive class into a `noMatch` example. Tighten detection when a cheap rule removes the class; otherwise adjust the noise tier. Never loosen a pattern or tier without sampled evidence.
6. Keep repository names, raw counts, and scorecards local. Public descriptions state only the profiles scanned, false-positive classes found, and committed examples, detection fixes, or tier changes they drove.

Calibration is bounded judgment work. Stop after the fixed repository set and sample size are classified and encoded. The highest-value inputs are field reports with `file:line`, why the finding was wrong, and repositories representative of the audited product.

## Skill synchronization

`../../skills/phase/SKILL.md` frontmatter is the source of truth for skill name, description, license, version, author, and abstract. The skill version is independent of the `phase` package version.

Update installable skill references after these changes:

- Update the matching reference after public option, type, default, phase, or reason changes.
- Update every occurrence of the canonical CSS pattern together.
- Keep the choosing-a-primitive tables in `packages/phase/README.md` and `../../skills/phase/SKILL.md` synchronized.
- Add or remove references with public exports. `pnpm skill:check` rejects uncovered exports and orphan references.

After changing skill source:

```bash
pnpm format:fix
pnpm skill:check
pnpm skill:build
pnpm skill:package
```

The package command creates a deterministic zip. The distribution guard permits only `SKILL.md`, `README.md`, `metadata.json`, `references/*.md`, `scripts/scan.mjs`, and `dist/phase-skill.zip` under `../../skills/phase/`.

Do not put bundle sizes, implementation details, or version-specific workarounds in skill references. Follow the root [`../../AGENTS.md`](../../AGENTS.md) for commit verification and versioning.
