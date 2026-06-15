import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  deps: {
    onlyBundle: ['@vercel/error'],
  },
  dts: {
    sourcemap: true,
  },
  entry: {
    ease: 'src/ease/index.ts',
    index: 'src/index.ts',
    react: 'src/react.ts',
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
