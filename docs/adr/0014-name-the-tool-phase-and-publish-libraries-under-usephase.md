# Name the tool phase and publish libraries under @usephase

## Status

Supersedes [ADR 0007](./0007-reserve-unscoped-names-for-published-packages.md), which reserved `phase` for the published runtime library.

## Context

The scanner tool became the primary product, and the runtime library is splitting into framework packages. At the time of this decision the published set is `phase` (the tool), `@usephase/core`, and `@usephase/react`. During the transition the tool's workspace package is named `@usephase/cli` and stays `"private": true`; the identity flip renames its published identity to `phase`. The old `phase` versions on npm carry the runtime library, so caret ranges on 0.x keep existing consumers on their pinned minor.

## Decision

Unscoped npm names are reserved for published tool identities: `phase` names the scanner tool and owns the `phase` bin. Everything else lives under the owned `@usephase` scope, which holds both published libraries and internal workspace packages; the `"private"` flag, not the name, states publication intent. Consumer artifact identities such as the `phase` skill name and `phase-skill.zip` remain independent of workspace naming.

## Reason

One unscoped name makes `npx phase` the product's front door instead of a library import. Keeping every other package inside an owned scope preserves the dependency-confusion protection ADR 0007 established, while the `"private"` flag keeps publication intent visible in each manifest even as packages move between private and published.
