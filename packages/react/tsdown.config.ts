import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
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
