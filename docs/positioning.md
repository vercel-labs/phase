# Positioning phase

Use this language when describing the phase repository, skill, scanner, or package. Technical contracts remain in the package documentation. [`CONTEXT.md`](../CONTEXT.md) owns canonical terms.

## Core description

Phase is a browser runtime performance toolkit for detecting and controlling avoidable browser work in animation, rendering, and loading.

Platforms and frameworks shape how code and data reach a page. Phase focuses on the decisions that remain once code runs in the browser: whether work needs to run now, whether an off-screen subtree needs to render, and whether non-critical code needs to load before interaction.

Metrics such as LCP and INP span delivery, framework, application, and browser behavior. Phase targets browser-side causes rather than claiming ownership of an entire metric.

## Parts of the toolkit

| Part            | What it does                                                                                               | Requires the `phase` package? |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Agent skill     | Audits browser runtime performance, checks each candidate in context, and recommends the cheapest safe fix | No                            |
| Scanner         | Finds source patterns associated with avoidable frame work, layout, paint, and observer costs              | No                            |
| Runtime library | Provides lifecycle-aware primitives when an application needs code to run, pause, render, or wait          | Yes                           |

The package is one possible recommendation from the skill, not a prerequisite for an audit. CSS, a browser API, a framework feature, or no change may be the correct result.

## What phase covers

### Animate

Can the browser own the animation, or does it require live JavaScript? If JavaScript must run, phase can stop the work when its output is not visible and apply reduced-motion behavior.

### Render

Does an off-screen subtree need style, layout, and paint now? Must its content remain in server-rendered HTML, or can React wait to mount it until idle scheduling runs or the viewport is near?

### Load

Does a module need to download on the critical path? The skill can identify code that should load dynamically, while the library can schedule non-critical imports and prefetches through idle scheduling or defer mounting until content is near the viewport.

These are separate decisions. One page may use CSS for animation, `Defer` for off-screen rendering, and a dynamic import for a heavy editor.

## Verification today

The skill and scanner provide a repeatable source-code verification loop:

```text
scan source -> inspect each candidate in context -> apply the cheapest safe fix -> scan again
```

The scanner reports candidates, not confirmed defects. The skill checks rendering semantics, framework behavior, and blast radius before recommending a change. `--fail-on` can turn selected severity tiers into a CI gate.

An optional Chrome DevTools performance trace adds measured evidence for a recorded load or interaction. Phase can analyze a trace the user supplies, or provide capture guidance after the user accepts it; phase does not capture traces automatically. Without a trace, the source audit is complete but makes no measured runtime claim.

## Reusable descriptions

### One line

Phase is a browser runtime performance toolkit for detecting and controlling avoidable browser work in animation, rendering, and loading.

### Short

Phase combines an agent skill, a deterministic source scanner, optional performance-trace analysis, and a runtime library. The skill audits any web application, the scanner makes source checks repeatable and CI-enforceable, traces can add measured evidence for a recorded path, and the library provides lifecycle-aware primitives when work needs to run, pause, render, or wait.

### Package

The `phase` package is a lifecycle-aware browser runtime layer for animation, rendering, and loading work. It combines visibility, reduced motion, idle scheduling, and frame timing so applications can stop or defer work that does not need to run yet.

## Language rules

- Use **browser runtime performance toolkit** for the repository and the complete project.
- Use **lifecycle-aware browser runtime layer** for the npm package.
- Describe the three areas as **animation, rendering, and loading**. Name only the areas relevant to the specific claim.
- Describe the scanner as deterministic, but describe its output as candidates that require review.
- Use **verification loop** for the required scan, inspect, fix, and rescan process plus optional performance-trace evidence. State when a result is source-based or measured, and never imply automatic trace capture.
- Do not describe the complete project as an animation library. The package includes animation primitives, while the skill and scanner apply without the package or any animation code.
- Do not claim that phase fully optimizes a page or owns a Core Web Vital. State the browser work it detects, defers, pauses, or removes.
