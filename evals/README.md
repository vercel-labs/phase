# phase skill evals

Seed scenarios for evaluating an agent using the phase skill. Contributor tooling only: this repository-root directory sits outside `skills/phase/`, so skill installations and security audits do not include adversarial fixtures. It is also excluded from lint and formatting because fixtures are frozen test data and the goldens pin `file:line` positions. Scanner noise tiers are calibrated against real codebases per the "Recalibrating the scanner" procedure in the repo's `AGENTS.md`; outcomes are encoded as executable `noMatch` examples and detection fixes, not committed as per-repo scorecards.

Control characters in adversarial fixtures are committed as placeholder tokens defined by `CONTROL_CHARACTER_TOKENS` in `scanner/scenarios.ts` (`{{ESC}}`, `{{BEL}}`, `{{RLO}}`, `{{PDF}}`). The scenario harness materializes those bytes in a temporary copy before scanning, so repository-wide security tools never interpret test payloads as live content. The golden scenario (`audit-planted-defects`) must stay token-free: `pnpm goldens` scans its committed fixture directly and fails if a token appears there.

`trigger-evals.json` is the balanced description-trigger dataset. It covers production animation and rendering work that should load the skill plus nearby exploratory animation work that should not. Run it through a trigger harness (e.g. the skill-creator description optimization loop) after changing the `SKILL.md` description. Two harness requirements, both learned the hard way: register the candidate as a real `.claude/skills/<name>/SKILL.md` (slash commands are not skills and never trigger), and give every parallel run its own throwaway project root. Workers sharing one root see each other's identically described copies and invoke a sibling's, which scores as a miss.

The last five should-trigger queries (extending or refactoring code that already uses phase APIs) are a known triggering ceiling, not a wording bug: measured at 3 runs/query, every description tested, including one that listed the exports verbatim and the pre-0.0.30 "always use when you mention any phase export" catch-all, passed at most 2-3 of them, with individual queries flipping between rounds. Agents only consult a skill when the task looks beyond them, and routine edits to phase-calling code do not. Treat those rows as the target for future description work, and do not accept a description change that trades them against the exploratory negatives. Consumer repos that want deterministic coverage should add a repo-rule (CLAUDE.md/AGENTS.md) to load the phase skill whenever editing a file that imports phase.

## Structure

Each scenario under `scenarios/` contains:

| File                     | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `prompt.md`              | The task given to the agent, phrased neutrally (never names the expected rule) |
| `expected-findings.json` | Machine-checkable ground truth plus an expected-behavior rubric                |
| `workspace/`             | Seeded project files (only for scenarios that scan code)                       |
| `expected-scan.txt/json` | Committed scanner goldens (only for scenarios with a full-scan gate)           |

Every scenario directory must contain a non-empty `prompt.md` and an `expected-findings.json` that satisfies the contract in `scanner/scenarios.ts`. Unknown fields fail validation. `scanner/__tests__/scenarios.spec.ts` executes the contract, assertion gates, and committed full-scan goldens on each `pnpm test`.

The root shape is:

```json
{
  "description": "What this scenario protects",
  "scan": {},
  "expectedBehavior": ["Non-gating agent behavior rubric"]
}
```

`description` and every `expectedBehavior` entry are non-empty strings. `expectedBehavior` is explicitly non-gating: it remains an eve-compatible soft rubric until an agent runner lands. `scan` must declare exactly one of these executable gate forms:

- `{"assertions": {...}, "target": "workspace"}` for one scan. `target` is optional.
- `{"runs": [{"name": "primary", "target": "workspace", "assertions": {...}}], "target": "shared-default"}` for multiple scans. `name`, run-level `target`, and scan-level `target` are optional. Target resolution is `run.target ?? scan.target ?? "workspace"`.
- `{"golden": "expected-scan"}` for a full-scan golden basename. Both `.txt` and `.json` files must exist, and `scanner/__tests__/scenarios.spec.ts` executes them.
- `{"skip": "Reason this advisory-only scenario has no scan gate"}` for an intentional, explained scan skip.

An `assertions` object must contain at least one of:

- `required`: entries shaped as `{"signal": "signal-id", "file": "optional/path", "count": 1}`. `file` and the non-negative integer `count` are optional.
- `requiredAbsent`: entries shaped as `{"signal": "signal-id", "reason": "Why silence is required"}`.
- `outputExcludes`: entries shaped as `{"text": "unsafe output", "reason": "Why it must be absent"}`.
- `context`: a partial scanner context using `framework`, `appRouter`, `ppr`, `clientComponents`, or `evidence`.

Signal IDs must exist in `scanner/signals.ts`. The shared loader enforces that `prompt.md` exists and is non-empty; reviewers enforce the neutral phrasing rule.

## Scenarios

1. **audit-planted-defects.** An audit request over a workspace with one planted defect per major signal. Ground truth is the full scan golden; the rubric checks each defect is classified at the right ladder tier.
2. **css-or-phase-advisory.** A loaded "how do I build this with phase" question whose correct answer is CSS-only. No workspace, no scan; tests ladder discipline.
3. **false-positive-discipline.** A workspace of legitimate code that pattern-matches several signals. Ground truth asserts which signals must stay silent; the rubric checks the agent classifies surviving candidates as "no change".
4. **ssr-semantics-guard.** A Server Component page with Next.js PPR enabled and a heavy server-rendered section. Encodes a confirmed failure. Its scan gate (PPR and App Router detected, nothing lazy-mounted yet) runs in CI; the behavioral half — blast-radius checking per audit.md Step 2.5 and an SSR-preserving recommendation (`Defer`) instead of an unlabeled client-gated mount — is a rubric awaiting the agent runner.
5. **deterministic-phase-loop.** A phase-owned logo loop whose transform/opacity output is completely determined by elapsed time. Encodes a confirmed audit miss: the scanner must surface the browser-keyframe opportunity, and the behavioral rubric expects CSS/WAAPI playback with phase retained only for lifecycle gating.
6. **route-rendered-dependencies.** A Next.js route whose directly rendered shared chart owns an unguarded recurring loop. Separate primary and focused scan gates prove scanner targets are non-transitive; the rubric checks dependency scoping, zero-flow lazy output, and consumer-owned route gating.

First manual behavioral run (2026-08-10, strong model, neutral prompt): passed the full rubric. The agent established context before recommending (found PPR in both the config and the route segment), correctly treated a zero-candidate scan as "manual checks still apply" rather than "nothing to do", recommended `Defer` with a Semantics: preserving label, explicitly rejected `WhenVisible`/`WhenIdle`/`ssr: false` as semantics-changing with the SSR/SEO/PPR impact stated, emitted the Out of scope handoff unprompted, and closed with the measurement rule. Single run with a strong model; the eve suite makes this repeatable.

## Running as agent evals (eve)

These seeds are shaped for [eve](https://eve.dev) `defineEval` wrappers (the vgpu `apps/agent-evals` pattern), planned as a follow-up:

- **Gates** come from `expected-findings.json`: run `scan.mjs --json` over the workspace the agent audited and assert the `scan` block (deterministic ground truth only).
- **Soft checks** come from the `expectedBehavior` rubric: skill navigation milestones and classification quality, scored by a narrow closed-QA judge, never gating.
- **Skips, not failures**, when model credentials are missing.
