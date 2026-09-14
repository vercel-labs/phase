import { expect, test } from '../fixtures';

test('Defer keeps content in server HTML and applies containment', async ({
  page,
  request,
}) => {
  const response = await request.get('/examples/defer/basic');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Content stays on the page');
  expect(html).toContain('Search-friendly content');

  await page.goto('/examples/defer/basic');
  const containment = await page
    .locator('.phx-defer-basic')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        contentVisibility: style.contentVisibility,
        containIntrinsicSize: style.containIntrinsicSize,
      };
    });

  expect(containment.contentVisibility).toBe('auto');
  expect(containment.containIntrinsicSize).toContain('360px');
});
