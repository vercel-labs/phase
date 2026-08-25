# Declare evidence by name

## Context

Signals that needed facts beyond their matching line were coupled to signal-specific policy booleans and distant detection-engine branches. Changing one detection could require coordinated edits whose relationship was neither typed nor visible in the catalog.

## Decision

Signals declare a named evidence requirement from the analysis module's typed registry. The registry owns predicates beside the analysis that produces their facts, catalog loading rejects unknown names, and detection performs one generic lookup. Custom lexical matchers remain separate.

## Reason

Named evidence makes each signal's dependency explicit while keeping analysis ownership local. It replaces cross-module policy flags with one constrained interface.

## Consequences

New reusable analysis requirements extend the registry and its `EvidenceName` union. Signal-specific booleans interpreted by distant engine branches are not part of the scanner contract.

Implemented by [PR #50](https://github.com/vercel-labs/phase/pull/50).
