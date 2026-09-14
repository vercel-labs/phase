import { manifest } from '@usephase/examples/manifest';

import { expect, test } from '../fixtures';

const exampleSlugs = Object.keys(manifest);

test('the contributor index links every current example slug', async ({
  page,
}) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: no-preference)').matches,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Phase runtime harness' }),
  ).toBeVisible();
  const links = page.locator('main a');
  await expect(links).toHaveCount(exampleSlugs.length);
  expect(
    await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href')),
    ),
  ).toEqual(exampleSlugs.map((slug) => `/examples/${slug}`));
});

test('an unknown example slug returns 404', async ({ request }) => {
  const response = await request.get('/examples/not-a-real/example');

  expect(response.status()).toBe(404);
});

for (const slug of exampleSlugs) {
  test(`${slug} renders and hydrates`, async ({ page }) => {
    const response = await page.goto(`/examples/${slug}`);

    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toHaveAttribute(
      'data-example-slug',
      slug,
    );
  });
}
