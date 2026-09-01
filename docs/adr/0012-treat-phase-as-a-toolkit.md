# Treat phase as a toolkit

## Context

The repository contains a runtime library, an agent skill, and a deterministic scanner. Describing the complete project as an animation library made the skill and scanner appear useful only when an application already used the package or contained animation code.

## Decision

Use **browser runtime performance toolkit** for the complete project and **lifecycle-aware browser runtime layer** for the npm package. Describe phase's work in three areas: animation, rendering, and loading. The skill audits any web application and may recommend CSS, browser or framework features, the `phase` package, an external library, or no change.

Call the scan, inspect, fix, and rescan process the required source path of the verification loop. An optional Chrome DevTools performance trace can prioritize exercised findings or compare runtime behavior before and after a change. Without a trace, the source audit is complete but cannot claim a measured runtime improvement.

## Reason

Separating the toolkit from the package states the actual product boundary. It also keeps the broader performance claim tied to shipped mechanisms instead of implying that one library controls every cause of page performance.
