# migrate-phase-to-usephase

Move applications from the legacy `phase` runtime to `@usephase/core` and `@usephase/react`.

## Run

Preview the migration:

```sh
npx @usephase/codemod@latest migrate-phase-to-usephase --dry .
```

Apply it:

```sh
npx @usephase/codemod@latest migrate-phase-to-usephase .
```

## Targets

The path may be a supported source file, a `package.json`, or a directory.

- Directory scans are recursive. They skip symlinks and child directories named `.cache`, `.git`, `.next`, `.turbo`, `build`, `coverage`, `dist`, `node_modules`, `out`, or `storybook-static`.
- A symlink target, a target below a symlinked directory, or one of those excluded directories passed directly is rejected.
- A supported file inside an excluded directory may be passed directly.

## Module mappings

| Old specifier | New specifier         |
| ------------- | --------------------- |
| `phase`       | `@usephase/core`      |
| `phase/react` | `@usephase/react`     |
| `phase/ease`  | `@usephase/core/ease` |

Any other `phase/*` specifier stops the migration before writes begin.

## Supported source

| Extensions                    | Parser     |
| ----------------------------- | ---------- |
| `.js`, `.jsx`, `.cjs`, `.mjs` | Babel      |
| `.ts`, `.cts`, `.mts`         | TypeScript |
| `.tsx`                        | TSX        |

The codemod rewrites:

- Static imports and re-exports
- TypeScript import types and import-equals declarations
- Dynamic `import()` calls
- Unshadowed global `require()` and `require.resolve()` calls
- Local `require()` and `require.resolve()` calls when `require` is created by a named `createRequire` import from `node:module` or `module`
- Unshadowed global `vi.mock()` and `jest.mock()` calls
- Mock calls through named imports from `vitest` and `@jest/globals`, including aliased imports

For calls, the module name must be a string literal or a template literal with no expressions.

Flow syntax is not supported, including in `.js` and `.jsx` files.

## Package changes

For each source file, the codemod finds the nearest ancestor `package.json`. Root and easing imports select `@usephase/core`; React imports select `@usephase/react`. It changes only manifest sections that already contain a `phase` entry.

- When the target includes both a package's `package.json` and its recognized source usage, the codemod replaces `phase` with the selected scoped packages.
- When `package.json` is an ancestor outside a targeted source file or subdirectory, the codemod adds the selected packages and retains `phase` for source outside the target.
- If the scan finds `.astro`, `.svelte`, or `.vue` files in the package, the codemod retains `phase` because it does not rewrite those files.
- When only `package.json` is targeted, or no recognized runtime usage is found, the codemod adds both scoped packages and retains `phase`.

These rules apply to `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`. Matching `peerDependenciesMeta`, `bundleDependencies`, and `bundledDependencies` entries follow the same replacement or retention rule. New dependency ranges use `^0.6.0`; existing scoped ranges and peer metadata are preserved.

Lockfiles are not edited. Run your package manager after the migration.

A changed `package.json` keeps its byte-order mark, indentation, line endings, and trailing-newline state. Other custom formatting may change.

## Requirements

`@usephase/core` and `@usephase/react` 0.6 require Node.js 24.
