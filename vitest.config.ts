import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    // Specs restore clock/observer spies at the end of the test body, which is
    // skipped when an assertion fails. Restoring automatically keeps one real
    // failure from cascading into unrelated ones.
    restoreMocks: true,
  },
});
