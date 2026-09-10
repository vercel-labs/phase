# @usephase/codemod

> **Status: Alpha.** Review the generated changes before committing them.

Codemods for migrating applications from the legacy `phase` runtime package.

## Migrate legacy runtime modules and dependencies

Run the import rename from the consumer repository root:

```bash
npx @usephase/codemod@latest rename-imports .
```

`<path>` must be a supported source file, a `package.json`, or a directory. Directory scans consider `.cjs`, `.cts`, `.js`, `.jsx`, `.mjs`, `.mts`, `.ts`, `.tsx`, and `package.json` files recursively. They skip symlink entries and child directories named `.cache`, `.git`, `.next`, `.turbo`, `build`, `coverage`, `dist`, `node_modules`, `out`, or `storybook-static`. A symlink or excluded directory passed as `<path>` is rejected. Pass a supported generated file directly when it must be migrated.

The command parses `.js` and `.jsx` with the Flow parser, `.ts`, `.cts`, and `.mts` with the TypeScript parser, `.tsx` with the TSX parser, and `.cjs` and `.mjs` with the Babel parser. It rewrites static imports and re-exports; TypeScript import types and import-equals declarations; and `import()`, `require()`, `require.resolve()`, `vi.mock()`, and `jest.mock()` calls whose module argument is a string literal or a template literal with no expressions. `require` must be unshadowed or be a local variable named `require` created through an imported `createRequire` from `node:module` or `module`. `vi` and `jest` must be unshadowed globals or named imports from `vitest` and `@jest/globals`, including aliased imports.

- `phase` becomes `@usephase/core`.
- `phase/react` becomes `@usephase/react`.
- `phase/ease` becomes `@usephase/core/ease`.

Other `phase/*` specifiers stop the migration before any writes and are reported for manual migration.

For each source file, the command finds its nearest ancestor `package.json`. Root and easing imports select `@usephase/core`, while React imports select `@usephase/react`. When the owning manifest and recognized runtime usage are included in the target, `phase` metadata is replaced with the selected packages. When the manifest is an ancestor outside a directly targeted source file or subdirectory, the selected packages are added but `phase` metadata is retained for unselected source. Packages containing `.astro`, `.svelte`, or `.vue` source also retain `phase` because those containers are not rewritten. When `package.json` is the only target or no runtime usage is visible, both packages are added conservatively and `phase` is retained. New entries use `^0.6.0`; existing scoped ranges and peer metadata are preserved. Matching `peerDependenciesMeta`, `bundleDependencies`, and `bundledDependencies` entries follow the same replacement or retention policy.

Lockfiles are never edited. Run your package manager after the codemod to install the new dependencies and update the lockfile.

When a `package.json` changes, the command serializes the entire manifest with its detected indentation and preserves whether it ended with a newline. Other custom formatting may change.

Preview the sorted changed-file summary without writing files:

```bash
npx @usephase/codemod@latest rename-imports --dry .
```

The dry run performs the same discovery and parsing as a write run. Read and parse failures happen before any writes. Each changed file is replaced atomically, but a later filesystem failure can leave an already reported prefix migrated; rerun the command to finish. Successful reruns are idempotent.

Exit code `0` means help was printed or the migration completed, including when no files changed. Exit code `1` means reading, parsing, or writing failed. Exit code `2` means the invocation or target was invalid.

The codemod command supports Node.js 20 and newer. The `@usephase/core@0.6.0` and `@usephase/react@0.6.0` packages installed by this migration require Node.js 24.
