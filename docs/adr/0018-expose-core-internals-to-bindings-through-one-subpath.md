# Expose core internals to bindings through one subpath

## Context

Framework bindings need shared machinery from the core library that applications should not touch: pooled observers, device-pixel-ratio tracking, and error constructors. Today twelve imports in the react binding cross into `core/_internal` (errors, ro-pool, dpr, mql-pool). Once the library splits into separate npm packages, those deep imports break: the paths are not exported, and exporting them publicly would freeze internals into the application-facing semver surface. Planned vue and svelte bindings need the same machinery, so this is a repeating seam rather than a one-off.

## Decision

`@usephase/core` declares an `./internal` subpath export for `@usephase/*` binding packages only. It is documented as outside the semver contract for applications: no deprecation cycle, no compatibility promise.

The compatibility rule that makes this safe: any change to the `./internal` surface bumps core's minor version, and bindings depend on core through a caret range. On 0.x versions a caret pins the minor, so an installed binding can never float onto a changed internal surface; a binding release that needs the new surface raises its own core range.

A helper joins `./internal` only when a second binding package needs it; single-consumer helpers stay private to core.

## Reason

One declared seam replaces ad-hoc deep imports, so the split does not force internals into the public API or duplicate pooling logic into every binding. The minor-bump rule turns "not semver-covered" from a warning into a mechanism: applications that ignore the documentation get the same protection bindings do, because nothing resolves onto a changed internal surface without an explicit range change.
