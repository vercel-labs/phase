# Keep the command-line scanner dependency-free

## Context

The same command-line source ships two ways: as the skill's committed consumer artifact, whose bundle may import only `node:` built-ins ([ADR 0008](./0008-enforce-the-skill-distribution-boundary.md)), and as the npm tool behind `npx phase`. An argument-parsing framework would be the tool's first runtime dependency, and because the bundle is shared, adopting one would either fork the two distributions apart or loosen the skill's distribution boundary. The command surface is two subcommands (`scan`, `explain`) and a fixed flag table.

## Decision

The command-line scanner imports `node:` built-ins only and declares zero runtime dependencies. Argument parsing stays on the existing table-driven parser, which the scanner's tests cover. Revisit only if third parties contribute commands or an interactive mode lands.

## Considered options

Surveyed CLI tools split on this by product shape: deepsec uses commander because plugins inject commands into a shared registry, while agent-browser and fx parse natively because startup time and install size are part of the product. phase matches the second shape: a fixed command table, no plugins, and `npx` cold-start as a primary path.

## Reason

Zero-dependency `npx` is a product property, not a build detail: nothing to install transitively, no supply-chain surface beyond Node itself, and the skill bundle check enforces it structurally on every merge. A parsing framework would buy flexibility the two-command surface does not use.

Implemented by [PR #80](https://github.com/vercel-labs/phase/pull/80).
