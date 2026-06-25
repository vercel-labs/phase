import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    ease: 'src/ease/index.ts',
    index: 'src/index.ts',
    react: 'src/react/index.ts',
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
