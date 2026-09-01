import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@testing-library/react',
      'react',
      'react-dom',
      'react/jsx-dev-runtime',
    ],
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.spec.{ts,tsx}'],
          exclude: ['src/**/*.browser.spec.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'browser',
          globals: true,
          include: ['src/**/*.browser.spec.{ts,tsx}'],
          // Playwright pointer actions are page-global; parallel pointer specs
          // can move the pointer out of another spec's iframe.
          fileParallelism: false,
          retry: 0,
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright({
              contextOptions: { reducedMotion: 'reduce' },
            }),
            instances: [
              { browser: 'chromium' },
              { browser: 'firefox' },
              { browser: 'webkit' },
            ],
          },
        },
      },
    ],
  },
});
