import type { Page } from '@playwright/test';

import { strongPauseCases } from '../contracts';
import { expect, test } from '../fixtures';

for (const contract of strongPauseCases) {
  test(`${contract.slug} cancels frames while off-screen`, async ({ page }) => {
    await page.goto(`/examples/${contract.slug}`);

    const example = page.locator(contract.selector);
    const phase = example.locator('output');
    await example.scrollIntoViewIfNeeded();
    await expect(phase).toHaveText('running');

    const visibleInvoked = await readInvoked(page);
    await expect.poll(() => readInvoked(page)).toBeGreaterThan(visibleInvoked);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(phase).toHaveText('paused');
    await expect.poll(() => readPending(page)).toBe(0);

    const pausedInvoked = await readInvoked(page);
    await page.waitForTimeout(150);
    expect(await readInvoked(page)).toBe(pausedInvoked);

    await example.scrollIntoViewIfNeeded();
    await expect(phase).toHaveText('running');
    await expect.poll(() => readInvoked(page)).toBeGreaterThan(pausedInvoked);
  });
}

function readInvoked(page: Page) {
  return page.evaluate(() => window.__rafStats.invoked);
}

function readPending(page: Page) {
  return page.evaluate(() => window.__rafStats.pending);
}
