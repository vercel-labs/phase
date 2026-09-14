import { expect, test as base } from '@playwright/test';

import { installRafStats } from './raf-stats';

type Fixtures = {
  browserFailures: string[];
  rafStats: undefined;
};

export const test = base.extend<Fixtures>({
  rafStats: [
    async ({ page }, use) => {
      await page.addInitScript(installRafStats);
      await use(undefined);
    },
    { auto: true },
  ],
  browserFailures: [
    async ({ page }, use) => {
      const failures: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          failures.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        failures.push(`pageerror: ${error.message}`);
      });

      await use(failures);

      expect(failures, 'browser warnings and errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
