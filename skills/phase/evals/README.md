# phase skill evals

Seed scenarios for evaluating an agent using the phase skill. Contributor tooling only: this directory is excluded from the consumer zip, from lint, and from formatting (fixtures are frozen test data; the goldens pin `file:line` positions).

## Structure

Each scenario under `scenarios/` contains:

| File                     | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `prompt.md`              | The task given to the agent, phrased neutrally (never names the expected rule) |
| `expected-findings.json` | Machine-checkable ground truth plus an expected-behavior rubric                |
| `workspace/`             | Seeded project files (only for scenarios that scan code)                       |
| `expected-scan.txt/json` | Committed scanner goldens (only for scenarios with a full-scan gate)           |

`src/__tests__/scan.spec.ts` already asserts the scanner side: the `audit-planted-defects` goldens are snapshot-tested on every `pnpm test`, so the deterministic layer of these evals cannot drift silently.

## Scenarios

1. **audit-planted-defects.** An audit request over a workspace with one planted defect per major signal. Ground truth is the full scan golden; the rubric checks each defect is classified at the right ladder tier.
2. **css-or-phase-advisory.** A loaded "how do I build this with phase" question whose correct answer is CSS-only. No workspace, no scan; tests ladder discipline.
3. **false-positive-discipline.** A workspace of legitimate code that pattern-matches several signals. Ground truth asserts which signals must stay silent; the rubric checks the agent classifies surviving candidates as "no change".

## Running as agent evals (eve)

These seeds are shaped for [eve](https://eve.dev) `defineEval` wrappers (the vgpu `apps/agent-evals` pattern), planned as a follow-up:

- **Gates** come from `expected-findings.json`: run `scan.mjs --json` over the workspace the agent audited and assert the `scan` block (deterministic ground truth only).
- **Soft checks** come from the `expectedBehavior` rubric: skill navigation milestones and classification quality, scored by a narrow closed-QA judge, never gating.
- **Skips, not failures**, when model credentials are missing.
