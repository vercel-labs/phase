# Ship consumer migrations as npx codemods

## Context

Changing the `phase` npm identity requires application repositories to rename runtime imports and dependencies before `phase` can become the scanner tool. The consumer migration must be repeatable across application repositories. It remains separate from `scripts/migrate-runtime-specifiers.mjs`, which rewrites repository-owned Markdown, examples, and scanner fixtures rather than parsed application modules.

## Decision

Consumer migrations ship in the public `@usephase/codemod` package and run through `npx`. Each migration is an additive subcommand; the first is `rename-imports`. Do not build a shared codemod framework until a second transform demonstrates what must be shared.

## Reason

A versioned package gives consumers one documented command and keeps migration behavior testable as an installed artifact. Additive subcommands preserve prior migrations, while delaying shared infrastructure avoids designing abstractions from one example.
