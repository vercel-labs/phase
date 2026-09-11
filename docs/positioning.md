# Positioning phase

Use this language when describing the phase repository, skill, scanner, tool, or packages. Technical contracts remain in the package documentation. [`CONTEXT.md`](../CONTEXT.md) owns canonical terms.

## Core description

Phase is a browser runtime performance toolkit for detecting and controlling avoidable browser work in animation, rendering, and loading.

Platforms and frameworks shape how code and data reach a page. Phase focuses on the decisions that remain once code runs in the browser: whether work needs to run now, whether an off-screen subtree needs to render, and whether non-critical code needs to load before interaction.

Metrics such as LCP and INP span delivery, framework, application, and browser behavior. Phase targets browser-side causes rather than claiming ownership of an entire metric.

## Parts of the toolkit

| Part                                                    | What it does                                                                                               | Requires the libraries? |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| Agent skill                                             | Audits browser runtime performance, checks each candidate in context, and recommends the cheapest safe fix | No                      |
| `phase` tool (CLI + GitHub Action)                      | Runs the deterministic scanner in terminals and CI; `phase scan` gates PRs, `phase explain` teaches fixes  | No                      |
| Runtime libraries (`@usephase/core`, `@usephase/react`) | Lifecycle-aware primitives when an application needs code to run, pause, render, or wait                   | Yes                     |

One scanner powers three distributions: the skill, the `phase` command-line package, and the GitHub Action. The distributions contain no judgment; detection and the severity and noise tiers live in the scanner.

The libraries are one possible recommendation from the skill, not a prerequisite for an audit. CSS, a browser API, a framework feature, or no change may be the correct result.

## Naming

- `phase` (unscoped npm package) is the tool: the command behind `npx phase scan` and `npx phase explain`. Versions below 0.6.0 are the legacy runtime library.
- `@usephase/core` and `@usephase/react` are the runtime libraries.
- The agent skill keeps the `phase` name and does not require either library to audit an application.

## What phase covers

### Animate

Can the browser own the animation, or does it require live JavaScript? If JavaScript must run, phase can stop the work when its output is not visible and apply reduced-motion behavior.

### Render

Does an off-screen subtree need style, layout, and paint now? Must its content remain in server-rendered HTML, or can React wait to mount it until idle scheduling runs or the viewport is near?

### Load

Does a module need to download on the critical path? The skill can identify code that should load dynamically, while the libraries can schedule non-critical imports and prefetches through idle scheduling or defer mounting until content is near the viewport.

These are separate decisions. One page may use CSS for animation, `Defer` for off-screen rendering, and a dynamic import for a heavy editor.

## The verification loop

Phase verifies in three modes:

- **Proactive**: the skill guides implementation and reviews so avoidable browser work is not introduced.
- **Gating**: `phase scan --fail-on` in CI fails a PR on new findings at selected severity tiers, against a committed baseline.
- **Reactive**: a full audit scans source, inspects each candidate in context, applies the cheapest safe fix, and scans again.

```text
scan source -> inspect each candidate in context -> apply the cheapest safe fix -> scan again
```

The scanner reports candidates, not confirmed defects. The skill checks rendering semantics, framework behavior, and blast radius before recommending a change.

An optional Chrome DevTools performance trace adds measured evidence for a recorded load or interaction. Phase can analyze a trace the user supplies, or provide capture guidance after the user accepts it; phase does not capture traces automatically. Without a trace, the source audit is complete but makes no measured runtime claim.

## Reusable descriptions

### One line

Phase is a browser runtime performance toolkit for detecting and controlling avoidable browser work in animation, rendering, and loading.

### Short

Phase combines an agent skill, a deterministic source scanner shipped as the `phase` CLI and a GitHub Action, optional performance-trace analysis, and two runtime libraries. The skill audits any web application, the scanner makes source checks repeatable and CI-enforceable, traces can add measured evidence for a recorded path, and `@usephase/core` with `@usephase/react` provide lifecycle-aware primitives when work needs to run, pause, render, or wait.

### Libraries

`@usephase/core` and `@usephase/react` form a lifecycle-aware browser runtime layer for animation, rendering, and loading work. They combine visibility, reduced motion, idle scheduling, and frame timing so applications can stop or defer work that does not need to run yet.

## Language rules

- Use **browser runtime performance toolkit** for the repository and the complete project.
- Use **the tool** or **the scan tool** for the `phase` npm package, and **lifecycle-aware browser runtime layer** for the `@usephase/*` libraries.
- Describe the three areas as **animation, rendering, and loading**. Name only the areas relevant to the specific claim.
- Describe the scanner as deterministic, but describe its output as candidates that require review.
- Use **verification loop** for the proactive, gating, and reactive modes plus optional performance-trace evidence. State when a result is source-based or measured, and never imply automatic trace capture.
- Do not describe the complete project as an animation library. The libraries include animation primitives, while the skill and tool apply without them or any animation code.
- Do not claim that phase fully optimizes a page or owns a Core Web Vital. State the browser work it detects, defers, pauses, or removes.
