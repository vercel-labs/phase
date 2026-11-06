import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsdown';

// The `tsc` executable of this package's TypeScript, from its package.json `bin`.
function typescriptCompiler(): string {
  const manifest = new URL(import.meta.resolve('typescript/package.json'));
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    bin: { tsc: string };
  };
  return fileURLToPath(new URL(bin.tsc, manifest));
}

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
    // TypeScript 7 has no JS API, so declarations come from its native compiler.
    tsgo: { path: typescriptCompiler() },
  },
  entry: {
    index: 'src/index.ts',
  },
  deps: {
    neverBundle: [
      '@usephase/core',
      '@usephase/core/ease',
      '@usephase/core/internal',
      'react',
    ],
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
