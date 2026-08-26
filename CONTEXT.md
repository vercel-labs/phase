# phase

This glossary defines the canonical domain language for phase. Terms are grouped by the system area that owns them.

`CONTEXT.md` owns vocabulary. [`docs/adr/`](./docs/adr/README.md) records durable decisions. [`AGENTS.md`](./AGENTS.md) owns contributor procedures.

## Scanner and audit

### Scanner output

**Signal**:
One scanner detection: what to look for, how to prioritize the result, and what to recommend instead. Owner: `packages/skill/scanner/signals.ts`.
_Avoid_: Rule, check

**Finding**:
A source-code location reported by a signal. It must be reviewed before being treated as a problem. Owners: `packages/skill/scanner/detect.ts` and `packages/skill/scanner/render.ts`.
_Avoid_: Problem, defect, violation

**Severity tier**:
The worst-case impact of an actionable finding: `critical`, `high`, or `medium`. `dedup` is separate: it marks correct code that phase can shorten. Owner: `packages/skill/scanner/signals.ts`.
_Avoid_: Priority tier

**Noise tier**:
How cautiously a reviewer should treat the detection before recommending a change: `precise`, `normal`, or `noisy`. Owner: `packages/skill/scanner/signals.ts`.
_Avoid_: Confidence tier

**Execution class**:
Whether the scanner sees a JavaScript finding inside repeatedly running code. `per-frame` means the line sits in a frame loop, observer callback, or move handler; `incidental` means no such repeated execution is visible. Stylesheets have no execution class. Owner: `packages/skill/scanner/detect.ts`.
_Avoid_: Execution tier, hotness tier

**Suppression directive**:
A `phase-scan-ignore <signal-id> -- <reason>` comment recording a human-approved reason to hide one signal at a specific line or, for file-wide signals, throughout the file. Owners: `packages/skill/scanner/lex.ts` and `packages/skill/scanner/detect.ts`.
_Avoid_: Ignore comment, exemption

### Analysis and evidence

**Analysis**:
Facts about a scanned file that are computed once and reused by several signals. Owner: `packages/skill/scanner/analysis.ts`.

**Evidence**:
A named yes/no check of surrounding code that a signal requires when the matching line alone is not enough. Owners: `packages/skill/scanner/analysis.ts` and `packages/skill/scanner/signals.ts`.

### Evaluation

**Scenario**:
A folder describing one evaluation, including its prompt, expected behavior, and any sample code or saved output it needs. Owners: `packages/skill/scanner/scenarios.ts` and `packages/skill/evals/README.md`.
_Avoid_: Eval case

**Gate**:
A repeatable check that CI can pass or fail, such as requiring a finding or comparing saved output. Owner: `packages/skill/scanner/__tests__/scenarios.spec.ts`.
_Avoid_: Hard check

**Rubric**:
A description of good agent behavior that a model-based evaluator may score, but that cannot fail CI. Owner: `packages/skill/evals/README.md`.
_Avoid_: Soft gate, soft check

**Golden**:
Saved scanner output for a fixed scenario. Tests compare a new run against it; the JSON comparison ignores only the skill version, which changes between releases. Owners: `packages/skill/evals/scenarios/audit-planted-defects/expected-scan.txt` and `packages/skill/evals/scenarios/audit-planted-defects/expected-scan.json`.
_Avoid_: Snapshot, expected output

**Planted-defect fixture**:
The fixed workspace containing intentional defects that exercise the scanner's major signals. Owner: `packages/skill/evals/scenarios/audit-planted-defects/workspace/`.
_Avoid_: Seeded workspace, test workspace

**Calibration**:
Running the scanner on representative real code, manually deciding which findings are accurate, and turning those results into examples, detection changes, or noise-tier changes. Owner: `packages/skill/AGENTS.md`.

**Recalibration**:
Repeating calibration after a detection change, a field report, or before a release that changes the scanner. Owner: `packages/skill/AGENTS.md`.

### Packaging

**Consumer artifact**:
The generated single scanner file users receive with phase's installable agent skill at `skills/phase/scripts/scan.mjs`, distinct from its typed source modules. Owner: `packages/skill/tsdown.scanner.config.ts`.
_Avoid_: Built scanner, bundled scanner

## Overloaded terms

- **Tier** always needs a qualifier: severity tier describes impact when real, while noise tier describes detection trust. `dedup` marks optional cleanup, and execution is a class rather than another tier.
- **Finding** means a source-code location reported by the scanner, not a confirmed problem or an evaluation expectation.
- **Evidence** means a named yes/no scanner check. Use **ground truth** for the findings an evaluation expects.
- **Scenario**, **fixture**, and **golden** are distinct: a scenario is the complete evaluation, a fixture is sample input, and a golden is saved scanner output.
