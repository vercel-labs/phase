import { expect, test } from '../fixtures';

test('WhenVisible swaps equal-height content as it approaches the viewport', async ({
  page,
}) => {
  await page.goto('/examples/when-visible/basic');

  const wrapper = page.locator('.phx-when-visible-basic');
  const fallback = page.getByText('Content appears as you scroll closer.');
  const content = page.getByText(
    'The content appears without moving the page.',
  );

  await expect(fallback).toBeAttached();
  await expect(content).toHaveCount(0);
  const before = await wrapper.boundingBox();
  expect(before).not.toBeNull();

  await wrapper.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - window.innerHeight - 100);
  });

  await expect(content).toBeAttached();
  await expect(wrapper).toHaveAttribute('data-phase', 'entered');
  const after = await wrapper.boundingBox();
  expect(after).not.toBeNull();
  expect(
    Math.abs((after?.height ?? 0) - (before?.height ?? 0)),
  ).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(content).toBeAttached();
});
