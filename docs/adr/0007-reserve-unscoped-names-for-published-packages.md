# Reserve unscoped names for published packages

## Context

The workspace contains one public npm package and private packages that exist only to build or test repository artifacts. An unclaimed internal package name can create dependency-confusion risk if tooling mistakes it for a registry dependency.

## Decision

Use unscoped package names only for published packages. The public library remains `phase`. Name internal workspace packages under `@usephase/*` and set `"private": true`. Workspace naming does not change consumer artifact identities such as the `phase` skill name or `phase-skill.zip`.

## Reason

The naming rule makes publication intent visible in every manifest and reserves internal names under an owned npm scope. Keeping consumer identities separate avoids leaking repository organization into install contracts.
