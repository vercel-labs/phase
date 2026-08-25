# phase

This glossary defines the scanner and audit language used by phase.

`CONTEXT.md` owns vocabulary. [`docs/adr/`](./docs/adr/README.md) records durable decisions. [`AGENTS.md`](./AGENTS.md) owns contributor procedures.

## Language

### Scanner output

**Signal**:
A catalog entry that describes one scanner detection, its triage metadata, and its replacement guidance. Owner: `scanner/signals.ts`.
_Avoid_: Rule, check

**Finding**:
A candidate site emitted when a signal matches source code. A finding requires classification and is not a verdict that the code is defective. Owners: `scanner/detect.ts` and `scanner/render.ts`.
_Avoid_: Problem, defect, violation

**Severity tier**:
The worst-case cost of a finding when the detected issue is real: `critical`, `high`, `medium`, or `dedup`. Owner: `scanner/signals.ts`.
_Avoid_: Priority tier

**Noise tier**:
How much site-level verification a detection needs before it can support a recommendation: `precise`, `normal`, or `noisy`. Owner: `scanner/signals.ts`.
_Avoid_: Confidence tier

**Execution class**:
The local execution context used to rank a JavaScript finding: `per-frame` when visible frame, observer, or move-handler ownership runs the line, otherwise `incidental`; stylesheets have no execution class. Owner: `scanner/detect.ts`.
_Avoid_: Execution tier, hotness tier

**Suppression directive**:
A reasoned `phase-scan-ignore <signal-id> -- <reason>` comment recording a human decision to silence one signal at a covered site or file. Owners: `scanner/lex.ts` and `scanner/detect.ts`.
_Avoid_: Ignore comment, exemption

### Analysis and evidence

**Analysis**:
Reusable facts computed once for a scanned file and shared across detections. Owner: `scanner/analysis.ts`.

**Evidence**:
A named predicate that a signal declares when matching its own line is insufficient to establish the candidate. Owners: `scanner/analysis.ts` and `scanner/signals.ts`.

### Evaluation

**Scenario**:
A directory containing a neutral prompt, a validated expected-findings contract, and any workspace or golden files needed to evaluate scanner and agent behavior. Owners: `scanner/scenarios.ts` and `evals/README.md`.
_Avoid_: Eval case

**Gate**:
A deterministic scenario assertion or golden comparison that passes or fails in CI. Owner: `scanner/__tests__/scenarios.spec.ts`.
_Avoid_: Hard check

**Rubric**:
Non-gating expected agent behavior that an evaluator can score probabilistically. Owner: `evals/README.md`.
_Avoid_: Soft gate, soft check

**Golden**:
Committed scanner output for a fixed scenario, compared exactly against a new run after normalizing its skill-version stamp. Owners: `evals/scenarios/audit-planted-defects/expected-scan.txt` and `evals/scenarios/audit-planted-defects/expected-scan.json`.
_Avoid_: Snapshot, expected output

**Planted-defect fixture**:
The fixed workspace containing intentional defects that exercise the scanner's major signals. Owner: `evals/scenarios/audit-planted-defects/workspace/`.
_Avoid_: Seeded workspace, test workspace

**Calibration**:
The bounded process of sampling scanner findings on representative real code, classifying them by hand, and encoding durable outcomes as examples, detection changes, or noise-tier changes. Owner: `AGENTS.md`.

**Recalibration**:
Repeating calibration after a detection change, a field report, or before a release that changes the scanner. Owner: `AGENTS.md`.

### Packaging

**Consumer artifact**:
The generated single-file scanner installed with the phase skill at `skills/phase/scripts/scan.mjs`, distinct from its typed source modules. Owner: `tsdown.scanner.config.ts`.
_Avoid_: Built scanner, bundled scanner

## Overloaded terms

- **Tier** always needs a qualifier: severity tier describes impact when real, while noise tier describes detection trust. Execution is a class, not a third tier.
- **Finding** means a scanner candidate, not a confirmed problem or an eval expectation.
- **Evidence** means a named scanner-analysis predicate. Use **ground truth** for an eval's expected findings.
- **Scenario**, **fixture**, and **golden** are distinct: a scenario is the complete eval case, a fixture is seeded input, and a golden is expected scanner output.
