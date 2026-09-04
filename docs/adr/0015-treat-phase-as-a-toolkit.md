# Treat phase as a toolkit

## Context

The repository contains a scanner with three distributions (the installable skill, the npm command-line package, and the GitHub Action) and a runtime library splitting into `@usephase/core` and `@usephase/react`. Describing the complete project as an animation library made the skill and scanner appear useful only when an application already used the package or contained animation code. A draft of this record predates the identity flip and named the runtime package `phase`; [ADR 0014](./0014-name-the-tool-phase-and-publish-libraries-under-usephase.md) moved that name to the tool.

## Decision

Use **browser runtime performance toolkit** for the complete project. `phase` names the tool: the scanner and its distributions. The `@usephase` libraries are optional lifecycle-aware primitives that a fix may use, not a prerequisite for an audit. Describe phase's work in three separate areas: animation, rendering, and loading. The skill audits any web application and may recommend CSS, browser or framework features, a `@usephase` library, an external library, or no change.

Call the scan, inspect, fix, and rescan process the required source path of the verification loop. An optional Chrome DevTools performance trace can prioritize exercised findings or compare runtime behavior before and after a change; phase never captures one automatically. Without a trace, a source audit is complete but cannot claim a measured runtime improvement.

## Reason

Separating the tool from the libraries states the actual product boundary. It also keeps the broader performance claim tied to shipped mechanisms instead of implying that one library controls every cause of page performance.
