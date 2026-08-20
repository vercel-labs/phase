import { defineConfig } from 'tsdown';

/**
 * Bundles the scanner source (scanner/scan.mjs) into the shipped,
 * committed skill artifact at skills/phase/scripts/scan.mjs.
 *
 * Separate from the library build (tsdown.config.ts): the scanner is a
 * standalone zero-dependency CLI, not a package entry point. The output
 * must stay a single ESM file, keep its shebang, import only `node:`
 * builtins, and preserve `import.meta.url` semantics — the skillVersion
 * stamp resolves `../metadata.json` / `../SKILL.md` relative to the
 * built file's location inside an installed skill.
 *
 * The output is generated and committed (like metadata.json and
 * dist/phase-skill.zip) and must be byte-deterministic so CI can verify
 * freshness via `git diff`. Determinism is only guaranteed for the
 * pinned tsdown version in package.json.
 */
export default defineConfig({
  clean: false,
  dts: false,
  entry: { scan: 'scanner/scan.mjs' },
  fixedExtension: true,
  format: ['esm'],
  outDir: 'skills/phase/scripts',
  sourcemap: false,
});
