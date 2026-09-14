import { expect, test } from '../fixtures';

test('tracks scheduled and canceled animation frames', async ({ page }) => {
  await page.goto('/');

  const delta = await page.evaluate(() => {
    const before = { ...window.__rafStats };
    const handle = requestAnimationFrame(() => undefined);
    cancelAnimationFrame(handle);

    return {
      scheduled: window.__rafStats.scheduled - before.scheduled,
      invoked: window.__rafStats.invoked - before.invoked,
      canceled: window.__rafStats.canceled - before.canceled,
      pending: window.__rafStats.pending,
    };
  });

  expect(delta).toEqual({
    scheduled: 1,
    invoked: 0,
    canceled: 1,
    pending: 0,
  });
});
