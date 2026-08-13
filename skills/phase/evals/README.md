# phase skill evals

Seed scenarios for evaluating an agent using the phase skill. Contributor tooling only: this directory is excluded from the consumer zip, from lint, and from formatting (fixtures are frozen test data; the goldens pin `file:line` positions). Scanner noise tiers are calibrated against real codebases per the "Recalibrating the scanner" procedure in the repo's `AGENTS.md`; outcomes are encoded as executable `noMatch` examples and detection fixes, not committed as per-repo scorecards.

## Structure

Each scenario under `scenarios/` contains:

| File                     | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `prompt.md`              | The task given to the agent, phrased neutrally (never names the expected rule) |
| `expected-findings.json` | Machine-checkable ground truth plus an expected-behavior rubric                |
| `workspace/`             | Seeded project files (only for scenarios that scan code)                       |
| `expected-scan.txt/json` | Committed scanner goldens (only for scenarios with a full-scan gate)           |

`src/__tests__/scan.spec.ts` executes the scanner side of every scenario on each `pnpm test`: the `audit-planted-defects` goldens are snapshot-tested, and each scenario's `scan.assertions` block (`required`, `requiredAbsent`, `context`) runs against its fixture workspace. The deterministic layer of these evals is a gate today; the `expectedBehavior` rubrics are not — those need an agent runner and are checked by hand until one lands.

## Scenarios

1. **audit-planted-defects.** An audit request over a workspace with one planted defect per major signal. Ground truth is the full scan golden; the rubric checks each defect is classified at the right ladder tier.
2. **css-or-phase-advisory.** A loaded "how do I build this with phase" question whose correct answer is CSS-only. No workspace, no scan; tests ladder discipline.
3. **false-positive-discipline.** A workspace of legitimate code that pattern-matches several signals. Ground truth asserts which signals must stay silent; the rubric checks the agent classifies surviving candidates as "no change".
4. **ssr-semantics-guard.** A Server Component page with Next.js PPR enabled and a heavy server-rendered section. Encodes a confirmed failure. Its scan gate (PPR and App Router detected, nothing lazy-mounted yet) runs in CI; the behavioral half — blast-radius checking per audit.md Step 2.5 and an SSR-preserving recommendation (`Defer`) instead of an unlabeled client-gated mount — is a rubric awaiting the agent runner.
5. **deterministic-phase-loop.** A phase-owned logo loop whose transform/opacity output is completely determined by elapsed time. Encodes a confirmed audit miss: the scanner must surface the browser-keyframe opportunity, and the behavioral rubric expects CSS/WAAPI playback with phase retained only for lifecycle gating.

First manual behavioral run (2026-08-10, strong model, neutral prompt): passed the full rubric. The agent established context before recommending (found PPR in both the config and the route segment), correctly treated a zero-candidate scan as "manual checks still apply" rather than "nothing to do", recommended `Defer` with a Semantics: preserving label, explicitly rejected `WhenVisible`/`WhenIdle`/`ssr: false` as semantics-changing with the SSR/SEO/PPR impact stated, emitted the Out of scope handoff unprompted, and closed with the measurement rule. Single run with a strong model; the eve suite makes this repeatable.

## Running as agent evals (eve)

These seeds are shaped for [eve](https://eve.dev) `defineEval` wrappers (the vgpu `apps/agent-evals` pattern), planned as a follow-up:

- **Gates** come from `expected-findings.json`: run `scan.mjs --json` over the workspace the agent audited and assert the `scan` block (deterministic ground truth only).
- **Soft checks** come from the `expectedBehavior` rubric: skill navigation milestones and classification quality, scored by a narrow closed-QA judge, never gating.
- **Skips, not failures**, when model credentials are missing.
