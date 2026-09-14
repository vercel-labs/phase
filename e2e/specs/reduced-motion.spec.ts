import { strongPauseCases } from '../contracts';
import { expect, test } from '../fixtures';

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('uses the reduced browser preference', async ({ page }) => {
    await page.goto('/');

    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
  });

  for (const contract of strongPauseCases) {
    test(`${contract.slug} pauses its frame loop`, async ({ page }) => {
      await page.goto(`/examples/${contract.slug}`);

      const example = page.locator(contract.selector);
      await example.scrollIntoViewIfNeeded();
      await expect(example.locator('output')).toHaveText('paused');
      await expect
        .poll(() => page.evaluate(() => window.__rafStats.pending))
        .toBe(0);

      const invoked = await page.evaluate(() => window.__rafStats.invoked);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__rafStats.invoked)).toBe(
        invoked,
      );
    });
  }

  test('useTween completes at its destination', async ({ page }) => {
    await page.goto('/examples/use-tween/basic');

    await page.getByRole('button', { name: 'Grow bar' }).click();
    await expect
      .poll(() =>
        page
          .locator('.phx-use-tween-basic-value')
          .evaluate((element) => element.style.transform),
      )
      .toBe('scaleX(1)');
  });

  test('WhenVisible mounts content without an enter animation', async ({
    page,
  }) => {
    await page.goto('/examples/when-visible/basic');

    const wrapper = page.locator('.phx-when-visible-basic');
    await wrapper.scrollIntoViewIfNeeded();
    await expect(wrapper).toHaveAttribute('data-phase', 'entered');
    await expect(wrapper).not.toHaveAttribute('data-enter', 'animate');
    await expect(
      page.getByText('The content appears without moving the page.'),
    ).toBeAttached();
  });

  test('Presence preserves show and hide behavior without motion', async ({
    page,
  }) => {
    await page.goto('/examples/presence/basic');

    const card = page.locator('.phx-presence-basic-card');
    await card.scrollIntoViewIfNeeded();
    await expect(card).not.toHaveAttribute('data-enter', 'animate');

    await page.getByRole('button', { name: 'Hide message' }).click();
    await expect(card).toHaveCount(0);

    await page.getByRole('button', { name: 'Show message' }).click();
    await expect(card).toHaveAttribute('data-phase', 'entered');
    await expect(card).not.toHaveAttribute('data-enter', 'animate');
  });
});
