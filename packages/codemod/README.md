# @usephase/codemod

> **Status: Alpha.** Review the generated changes before committing them.

Codemods for migrating applications from the legacy `phase` runtime package.

## Rename runtime imports

Run the import rename from the consumer repository root:

```bash
npx @usephase/codemod@latest rename-imports .
```

`<path>` may be a supported source file, a `package.json`, or a directory. A directory scan considers `.cjs`, `.cts`, `.js`, `.jsx`, `.mjs`, `.mts`, `.ts`, `.tsx`, and `package.json` files recursively. It skips descendant directories named `.git` or `node_modules`; all other directories, including build output, are included.

The command rewrites imports, re-exports, dynamic imports, CommonJS `require` calls, and `vi.mock` or `jest.mock` calls:

- `phase` becomes `@usephase/core`.
- `phase/react` becomes `@usephase/react`.
- `phase/ease` becomes `@usephase/core/ease`.

Each `phase` entry in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` becomes `@usephase/core` and `@usephase/react` at `^0.6.0`. Matching `peerDependenciesMeta` moves to both packages. Existing scoped dependency ranges and peer metadata are preserved. Lockfiles are never edited; run your package manager after the codemod to install the new dependencies and update the lockfile.

When a `package.json` changes, the command serializes the entire manifest with its detected indentation and preserves whether it ended with a newline. Other custom formatting may change.

Preview the sorted changed-file summary without writing files:

```bash
npx @usephase/codemod@latest rename-imports --dry .
```
