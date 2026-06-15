import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: ['react', 'react-dom', '@vercel/error'],
  },
  dts: {
    sourcemap: true,
  },
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
