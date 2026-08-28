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
