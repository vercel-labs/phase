# Decouple GitHub release protection from npm identity

## Context

GitHub environment protection is an operational control that may change as release risk changes. Each npm trusted-publisher configuration binds a package to a repository, workflow, and optional GitHub environment. The configuration cannot be edited after creation, so changing the environment match requires deleting and recreating it.

## Decision

Publish jobs use the `release` GitHub environment, while every npm trusted-publisher configuration leaves its optional Environment field blank and explicitly allows direct `npm publish`.

## Reason

GitHub can add or remove reviewers without changing npm's OIDC identity configuration. npm still restricts publication to this repository and top-level workflow, while GitHub owns the adjustable approval gate.
