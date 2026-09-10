import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    ease: 'src/ease/index.ts',
    index: 'src/index.ts',
    internal: 'src/internal.ts',
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
