# Split along region seams, not per signal

## Context

Splitting every signal into its own file would make the catalog look modular while scattering shared machinery. At the decision point, 12 of 27 signals were roughly six-line data entries, while analysis, lexical masking, detection, and rendering carried the real complexity.

## Decision

Keep signals as catalog data and split scanner source along region seams: signals, analysis, detection, lexical handling, context, walking, rendering, and CLI orchestration.

## Reason

Region seams isolate cohesive mechanisms and their invariants. File-per-signal organization would create shallow modules without giving shared behavior a clearer owner.

## Consequences

New signals normally extend the catalog and executable examples. Shared behavior belongs to the region that computes or applies it; custom lexical matchers remain available when a catalog pattern cannot express the detection.

Implemented by [PR #47](https://github.com/vercel-labs/phase/pull/47).
