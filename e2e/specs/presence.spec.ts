import { expect, test } from '../fixtures';

test('Presence exposes exit and remount lifecycle states', async ({ page }) => {
  await page.goto('/examples/presence/basic');

  const card = page.locator('.phx-presence-basic-card');
  const button = page.getByRole('button', { name: 'Hide message' });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-phase', 'entered');
  await expect(card).not.toHaveAttribute('data-enter', 'animate');

  await button.click();
  await expect(card).toHaveAttribute('data-phase', 'exiting');
  await expect(card).toHaveCount(0);

  await page.getByRole('button', { name: 'Show message' }).click();
  await expect(card).toHaveAttribute('data-phase', 'entered');
  await expect(card).toHaveAttribute('data-enter', 'animate');
});
