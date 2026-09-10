import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  cwd: import.meta.dirname,
  deps: { neverBundle: ['jscodeshift'] },
  dts: false,
  entry: { 'usephase-codemod': 'src/cli.ts' },
  fixedExtension: true,
  format: ['esm'],
  platform: 'node',
  sourcemap: false,
  target: 'node20',
});
