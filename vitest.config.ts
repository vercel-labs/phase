import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    // Run diagnostics in dev mode so specs see full why/fix messages
    // instead of the lean prod proxy (which exposes only the code).
    env: { NODE_ENV: 'development' },
  },
});
