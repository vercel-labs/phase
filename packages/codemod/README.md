# @usephase/codemod

Versioned migrations for phase packages.

> **Status: Alpha.** Review all changes before committing them.

Each migration is a subcommand named for its source and destination. Published subcommands keep their original behavior, so teams can run the same migration later.

## Available codemods

<!-- CODEMOD-TABLE:START -->

| Codemod                                                                                                                              | From           | To                                                  | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| [`migrate-phase-to-usephase`](https://github.com/vercel-labs/phase/blob/main/packages/codemod/codemods/migrate-phase-to-usephase.md) | `phase <0.6.0` | `@usephase/core ^0.6.0`<br>`@usephase/react ^0.6.0` | Move legacy runtime imports and package metadata to the scoped packages. |

<!-- CODEMOD-TABLE:END -->

The linked guide explains what each codemod changes and any limits that apply.

## Run a codemod

```sh
npx @usephase/codemod@latest <codemod> [--dry] <path>
```

1. Start from a clean Git worktree.
2. Run with `--dry` and read the report.
3. Run again without `--dry`.
4. Review the diff.
5. Run your package manager. Codemods do not edit lockfiles.

## Safety

- `--dry` writes nothing.
- Discovery and parsing finish before writes begin.
- Each changed file is replaced atomically.
- If a later write fails, the report lists completed files. Rerunning is safe.

## Exit codes

| Code | Meaning                           |
| ---- | --------------------------------- |
| 0    | Help shown or migration succeeded |
| 1    | Read, parse, or write failure     |
| 2    | Invalid invocation or target      |

## Requirements

Node.js 20 or later.
